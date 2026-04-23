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

export interface ScanResultDTO {
  extracted: string[];
  matched: Array<MedicineSearchResult & { confidence: number }>;
  unmatched: string[];
  aiCosts: AiCost[];
}
