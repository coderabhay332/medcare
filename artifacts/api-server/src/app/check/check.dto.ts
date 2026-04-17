export interface CheckRequestDTO {
  newMedicines: Array<{ brand: string; composition: string }>;
}

export interface CheckResultItem {
  medicine: string;
  status: 'safe' | 'warning' | 'banned' | 'interaction';
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  reason: string;
  conflictsWith: string | null;
  gazette_ref: string | null;
  dosageGuidance: string;
  source: 'india_gazette' | 'openFDA' | 'claude' | 'unavailable';
}

export interface CheckResponseDTO {
  safe: boolean;
  summary: string;
  results: CheckResultItem[];
}
