export interface MedicineRecord {
  url?: string;
  brand_name: string;
  composition: string;
  manufacturer: string;
  price: string;
  safety_advice: {
    Alcohol?: string;
    Pregnancy?: string;
    'Breast feeding'?: string;
    Driving?: string;
    Kidney?: string;
    Liver?: string;
  };
  drug_interactions?: string;
  product_intro?: string;
  how_it_works?: string;
  uses?: string;
  benefits?: string;
  side_effects?: string;
}

export interface MedicineSearchResult extends MedicineRecord {
  salts: string[];
  score?: number;
}

export interface ScanResultDTO {
  extracted: string[];
  matched: Array<MedicineSearchResult & { confidence: number }>;
  unmatched: string[];
}
