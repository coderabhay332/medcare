import type { AiCost } from '../../lib/priceTracker.js';

export interface MedicineRecord {
  url?: string;
  brand_name: string;
  composition?: string;
  manufacturer?: string;
  price?: string;
  safety_advice?: Record<string, string> | string;
  fact_box?: Record<string, unknown> | string;
  drug_interactions?: unknown;
  product_intro?: string;
  how_it_works?: string;
  uses?: string;
  benefits?: string;
  side_effects?: string;
  substitutes?: string;
  user_feedback?: string;
  error?: string;
}

export interface MedicineSearchResult extends MedicineRecord {
  salts?: string[];   // computed from composition, not stored in DB
  score?: number;
}

export type ScanKind = 'medicine_label' | 'prescription' | 'not_medicine' | 'unclear';

/** A name that was auto-corrected to a known brand via fuzzy match */
export interface ScanCorrection {
  /** What the AI originally extracted */
  original: string;
  /** What we snapped it to (a real brand in our DB) */
  corrected: string;
  /** Fuse.js score; lower = closer match */
  score: number;
}

export interface ScanResultDTO {
  /** Classification of the uploaded image */
  kind: ScanKind;
  /** User-facing one-liner. Set when no medicines were extracted. */
  message?: string;
  /** Final medicine names after fuzzy correction */
  extracted: string[];
  /** AI extractions that were auto-corrected to known brands */
  corrections: ScanCorrection[];
  matched: Array<MedicineSearchResult & { confidence: number }>;
  unmatched: string[];
  aiCosts: AiCost[];
}
