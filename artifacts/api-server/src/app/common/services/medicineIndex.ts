/**
 * medicineSearch.ts
 * -----------------
 * Replaces the old Fuse.js / CSV approach with MongoDB queries.
 *
 * Strategy (in order of priority):
 *  1. MongoDB $text search  — uses the text index on brand_name + composition
 *  2. Regex fallback         — case-insensitive partial match on brand_name
 *
 * parseSalts() is kept for callers that still need it.
 */

import Fuse from 'fuse.js';
import { Medicine } from '../models/Medicine.model.js';
import { parseSalts } from '../helper/saltParser.js';
import type { MedicineRecord, MedicineSearchResult } from '../../medicines/medicines.dto.js';

export { parseSalts };

// ── Fuzzy brand index (in-memory, single-flight, long-lived) ─────────────────
// Snaps OCR-extracted names ("Angformin") to known DB brands ("Anafortan").
// Built once (eagerly via warmFuzzyIndex() or lazily on first request);
// concurrent callers share the same in-flight build.
interface BrandEntry { brand_name: string }
let fuzzyIndex: Fuse<BrandEntry> | null = null;
let fuzzyIndexBuiltAt = 0;
let fuzzyIndexBuilding: Promise<Fuse<BrandEntry> | null> | null = null;
const FUZZY_INDEX_TTL_MS = 60 * 60 * 1000; // 1h — brand list rarely changes mid-run

async function buildFuzzyIndex(): Promise<Fuse<BrandEntry> | null> {
  const t0 = Date.now();
  try {
    const docs = await Medicine.find({}, { brand_name: 1, _id: 0 }).lean().exec();
    const entries: BrandEntry[] = docs
      .map(d => ({ brand_name: (d as { brand_name?: string }).brand_name ?? '' }))
      .filter(e => e.brand_name.length > 0);
    const idx = new Fuse(entries, {
      keys: ['brand_name'],
      threshold: 0.3,         // tighter than before — 44k brands need stricter matching
      distance: 100,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 3,
    });
    fuzzyIndex = idx;
    fuzzyIndexBuiltAt = Date.now();
    console.log(`[medicineIndex] fuzzy index built with ${entries.length} brands in ${Date.now() - t0}ms`);
    return idx;
  } catch (err) {
    console.warn('[medicineIndex] could not build fuzzy index:', (err as Error).message);
    return null;
  }
}

async function getFuzzyIndex(): Promise<Fuse<BrandEntry> | null> {
  const now = Date.now();
  if (fuzzyIndex && now - fuzzyIndexBuiltAt < FUZZY_INDEX_TTL_MS) return fuzzyIndex;
  // Single-flight: concurrent callers wait on the same build instead of starting their own.
  if (!fuzzyIndexBuilding) {
    fuzzyIndexBuilding = buildFuzzyIndex().finally(() => { fuzzyIndexBuilding = null; });
  }
  return fuzzyIndexBuilding;
}

/** Eager warm-up — call once at server startup so the first scan isn't slow. */
export async function warmFuzzyIndex(): Promise<void> {
  await getFuzzyIndex();
}

/**
 * Find the closest known brand name by fuzzy matching.
 * Returns null if no candidate is similar enough or the index is unavailable.
 * Lower score = better match (Fuse.js convention).
 */
export async function findClosestBrand(
  name: string,
  maxScore = 0.4,
): Promise<{ brand: string; score: number } | null> {
  const trimmed = name.trim();
  if (trimmed.length < 3) return null;

  const fuse = await getFuzzyIndex();
  if (!fuse) return null;

  const results = fuse.search(trimmed, { limit: 1 });
  if (results.length === 0) return null;

  const top = results[0];
  if (top.score === undefined || top.score > maxScore) return null;

  // Don't suggest a "correction" that's identical (case-insensitive)
  if (top.item.brand_name.toLowerCase() === trimmed.toLowerCase()) return null;

  return { brand: top.item.brand_name, score: top.score };
}

// ── Similarity helpers ────────────────────────────────────────────────────────
/**
 * Normalize for comparison: lowercase, strip Rx prefixes/suffixes, dosage numbers,
 * and all punctuation/whitespace. So "Cap. Pantium L 20mg Tablet" → "pantiuml".
 */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(tab|cap|inj|syp|syr|sus|drop|drops|oint|cream|gel|sol)\.?\s+/i, '')
    .replace(/\b(tablet|tablets|capsule|capsules|syrup|syrups|injection|infusion|cream|gel|drops|suspension|powder|solution|ointment|lotion|spray|granules|sachet)\b/gi, '')
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|ml|g|iu|gm|%)\b/gi, '')   // strip dosage numbers
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** 0 = totally different, 1 = identical (case/punct insensitive). */
export function similarity(a: string, b: string): number {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length >= y.length ? y : x;
  if (longer.length === 0) return 1;
  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

/**
 * Resolve an OCR-extracted medicine name to a real brand in the DB.
 *
 * Pipeline:
 *   1. Mongo search → if top hit's brand is similar enough to input, accept (high).
 *   2. Otherwise fuzzy index → if a close brand exists, fetch its full record (medium).
 *   3. Otherwise return null (unresolved — caller should leave as-is, not invent).
 *
 * This is the single source of truth for brand-name resolution. Both the scan
 * flow and the report extraction use it. Critical for safety: never return a
 * match labelled "high" when the brand name doesn't actually resemble the input
 * (e.g. "Mogilax" must NOT silently resolve to "Risen T").
 */
export async function resolveBrandName(
  name: string,
  similarityThreshold = 0.7,
): Promise<{
  result: MedicineSearchResult;
  confidence: 'high' | 'medium';
  corrected?: string;  // present when fuzzy-correction was applied
} | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // 1. Direct Mongo search — verify the top hit actually resembles the input
  const direct = await searchMedicines(trimmed, 1);
  if (direct.length > 0) {
    const sim = similarity(trimmed, direct[0].brand_name ?? '');
    if (sim >= similarityThreshold) {
      return { result: direct[0], confidence: 'high' };
    }
  }

  // 2. Fuzzy correction fallback — but ALSO verify with Levenshtein.
  // Fuse over 44k brands can produce confident-looking but spurious matches
  // (e.g. "Angformin" → "Walformin Tablet"). Reject anything that fails the
  // same similarity bar as direct matches.
  const fuzzy = await findClosestBrand(trimmed);
  if (fuzzy) {
    const sim = similarity(trimmed, fuzzy.brand);
    if (sim >= similarityThreshold) {
      const fetched = await searchMedicines(fuzzy.brand, 1);
      if (fetched.length > 0) {
        return { result: fetched[0], confidence: 'medium', corrected: fuzzy.brand };
      }
    } else {
      console.log(`[medicineIndex] rejected fuzzy "${trimmed}" → "${fuzzy.brand}" (similarity ${sim.toFixed(2)} < ${similarityThreshold})`);
    }
  }

  return null;
}

/**
 * Convert a raw DB document to the MedicineSearchResult shape.
 */
function toSearchResult(doc: MedicineRecord & { _id?: unknown }): MedicineSearchResult {
  const plain = { ...doc } as MedicineRecord & { salts?: string[] };
  const salts = parseSalts(doc.composition ?? '');
  return { ...plain, salts };
}

/**
 * Search medicines using MongoDB text index first, regex fallback second.
 * @param query  Search term (brand name, salt, composition, etc.)
 * @param limit  Max results to return (default 10)
 */
export async function searchMedicines(
  query: string,
  limit = 10,
): Promise<MedicineSearchResult[]> {
  if (!query?.trim()) return [];

  // ── 1. Text index search (fast, uses index) ─────────────────────────────
  try {
    const textResults = await Medicine.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' }, __v: 0 }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean()
      .exec();

    if (textResults.length > 0) {
      return textResults.map(doc => toSearchResult(doc as unknown as MedicineRecord));
    }
  } catch (_) {
    // text index may not exist yet — fall through to regex
  }

  // ── 2. Regex fallback (brand_name partial match) ─────────────────────────
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const regexResults = await Medicine.find(
    { brand_name: regex },
    { __v: 0 }
  )
    .limit(limit)
    .lean()
    .exec();

  return regexResults.map(doc => toSearchResult(doc as unknown as MedicineRecord));
}

/**
 * Exact brand-name lookup (case-insensitive).
 */
export async function getMedicineByBrand(brand: string): Promise<MedicineSearchResult | null> {
  const doc = await Medicine.findOne(
    { brand_name: new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    { __v: 0 }
  ).lean().exec();

  return doc ? toSearchResult(doc as unknown as MedicineRecord) : null;
}

