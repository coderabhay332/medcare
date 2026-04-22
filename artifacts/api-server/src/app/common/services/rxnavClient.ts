/**
 * rxnavClient.ts
 * Handles the full RxNav pipeline:
 *   1. Normalise Indian/British salt name → RxNorm canonical name
 *   2. Resolve RxNorm name → RxCUI  (cached in RxCuiCacheModel)
 *   3. Query NLM RxNav Interaction API  (cached in RxNavCacheModel)
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { RxCuiCacheModel, RxNavCacheModel } from '../../check/check.schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load RxNorm name normalisation table ────────────────────────────────────
let rxnormNames: Record<string, string> = {};

function loadRxNormNames(): void {
  const p = path.join(__dirname, '../../../../data/rxnorm_names.json');
  if (fs.existsSync(p)) {
    rxnormNames = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, string>;
  }
}

loadRxNormNames();

/**
 * Normalise a raw salt name to its RxNorm canonical equivalent.
 * Falls back to the input if no mapping is found.
 * Example: "Paracetamol" → "acetaminophen"
 *          "Amoxycillin" → "amoxicillin"
 */
export function normaliseToRxNorm(rawSalt: string): string {
  const key = rawSalt.trim().toLowerCase();
  return rxnormNames[key] ?? key;
}

// ── RxCUI resolution ─────────────────────────────────────────────────────────

const RXCUI_URL = 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=';

/**
 * Resolve a (normalised) RxNorm name to its RxCUI.
 * Results are cached in MongoDB — `null` means confirmed-not-found.
 */
export async function resolveRxCui(rxnormName: string): Promise<string | null> {
  const key = rxnormName.trim().toLowerCase();

  // 1. Check MongoDB cache
  const cached = await RxCuiCacheModel.findOne({ saltKey: key });
  if (cached !== null) {
    return cached.rxcui ?? null;
  }

  // 2. Call NLM API
  try {
    const url = `${RXCUI_URL}${encodeURIComponent(rxnormName)}&search=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      await RxCuiCacheModel.create({ saltKey: key, rxcui: null });
      return null;
    }

    const data = await res.json() as {
      idGroup?: { rxnormId?: string[] };
    };

    const rxcui = data.idGroup?.rxnormId?.[0] ?? null;
    await RxCuiCacheModel.create({ saltKey: key, rxcui });
    return rxcui;
  } catch {
    // Network error — don't cache so we retry next time
    return null;
  }
}

// ── RxNav Interaction API ────────────────────────────────────────────────────

const RXNAV_INTERACTION_URL = 'https://rxnav.nlm.nih.gov/REST/interaction/list.json';

export interface RxNavResult {
  found: boolean;
  description: string;
  severity: string; // 'high' | 'moderate' | 'low' | 'unknown'
}

/**
 * Query the NLM RxNav Interaction API for two RxCUIs.
 * Results are cached by a sorted pair hash in MongoDB.
 */
export async function checkRxNavByCui(cuiA: string, cuiB: string): Promise<RxNavResult> {
  const pairHash = [cuiA, cuiB].sort().join('|');

  // 1. Check MongoDB cache
  const cached = await RxNavCacheModel.findOne({ pairHash });
  if (cached) {
    return { found: cached.found, description: cached.description, severity: cached.severity };
  }

  // 2. Call NLM RxNav API
  try {
    const url = `${RXNAV_INTERACTION_URL}?rxcuis=${cuiA}+${cuiB}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });

    if (!res.ok) {
      const notFound: RxNavResult = { found: false, description: '', severity: '' };
      await RxNavCacheModel.create({ pairHash, ...notFound });
      return notFound;
    }

    const data = await res.json() as {
      fullInteractionTypeGroup?: Array<{
        fullInteractionType?: Array<{
          interactionPair?: Array<{
            severity?: string;
            description?: string;
          }>;
        }>;
      }>;
    };

    const pairs = data.fullInteractionTypeGroup
      ?.flatMap(g => g.fullInteractionType ?? [])
      ?.flatMap(t => t.interactionPair ?? []) ?? [];

    if (pairs.length === 0) {
      const notFound: RxNavResult = { found: false, description: '', severity: '' };
      await RxNavCacheModel.create({ pairHash, ...notFound });
      return notFound;
    }

    // Pick the worst severity entry
    const severityRank: Record<string, number> = { 'N/A': 0, low: 1, moderate: 2, high: 3 };
    const best = pairs.sort(
      (a, b) => (severityRank[b.severity ?? 'N/A'] ?? 0) - (severityRank[a.severity ?? 'N/A'] ?? 0)
    )[0];

    const result: RxNavResult = {
      found: true,
      description: best.description ?? '',
      severity: (best.severity ?? 'unknown').toLowerCase(),
    };

    await RxNavCacheModel.create({ pairHash, ...result });
    return result;
  } catch {
    // Network timeout or parse error — don't cache so we retry
    return { found: false, description: '', severity: '' };
  }
}

/**
 * Full pipeline: raw salt name → normalise → RxCUI → RxNav check.
 * Returns null if RxCUI resolution fails for either salt.
 */
export async function checkRxNavBySalts(rawSaltA: string, rawSaltB: string): Promise<RxNavResult | null> {
  const nameA = normaliseToRxNorm(rawSaltA);
  const nameB = normaliseToRxNorm(rawSaltB);

  const [cuiA, cuiB] = await Promise.all([resolveRxCui(nameA), resolveRxCui(nameB)]);

  if (!cuiA || !cuiB) {
    // One or both salts couldn't be resolved — skip RxNav, fall through to Claude
    return null;
  }

  return checkRxNavByCui(cuiA, cuiB);
}
