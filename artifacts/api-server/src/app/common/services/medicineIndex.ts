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

import mongoose from 'mongoose';
import { Medicine } from '../models/Medicine.model.js';
import { parseSalts } from '../helper/saltParser.js';
import type { MedicineRecord, MedicineSearchResult } from '../../medicines/medicines.dto.js';

export { parseSalts };

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

// ---------------------------------------------------------------------------
// Legacy compat shims — kept so medicineIndex.ts callers don't break
// These are no-ops now that search is driven by MongoDB.
// ---------------------------------------------------------------------------
export function initMedicineIndex(_csvPath: string): void {
  // No-op: index is now in MongoDB. Called from index.ts — safe to call.
}

export function getAllRecords(): MedicineSearchResult[] {
  // Sync API not viable with MongoDB; return empty. Use searchMedicines instead.
  return [];
}
