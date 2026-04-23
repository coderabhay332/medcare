import type { AiCost } from '../../lib/priceTracker.js';

export interface CheckRequestDTO {
  medicines: string[];
}

export interface CheckResultItem {
  medicine: string;
  status: 'safe' | 'warning' | 'banned' | 'interaction';
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  reason: string;
  problem: string;
  alternatives: string[];
  conflictsWith: string | null;
  gazette_ref: string | null;
  dosageGuidance: string;
  source: 'india_gazette' | 'openFDA' | 'rxnav' | 'claude' | 'organ_burden' | 'unavailable';
}

export interface CheckResponseDTO {
  safe: boolean;
  summary: string;
  results: CheckResultItem[];
  aiCosts: AiCost[];
}
