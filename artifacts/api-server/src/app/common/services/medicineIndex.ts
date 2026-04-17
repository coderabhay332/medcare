import Fuse from 'fuse.js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { parseSalts } from '../helper/saltParser.js';
import type { MedicineRecord, MedicineSearchResult } from '../../medicines/medicines.dto.js';

let fuseIndex: Fuse<MedicineSearchResult> | null = null;
let allRecords: MedicineSearchResult[] = [];

export function initMedicineIndex(csvPath: string): void {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as MedicineRecord[];

  allRecords = records.map(r => {
    let safetyAdvice: MedicineRecord['safety_advice'] = {};
    if (typeof r.safety_advice === 'string') {
      try {
        safetyAdvice = JSON.parse(r.safety_advice) as MedicineRecord['safety_advice'];
      } catch {
        safetyAdvice = {};
      }
    } else {
      safetyAdvice = r.safety_advice ?? {};
    }

    return {
      ...r,
      safety_advice: safetyAdvice,
      salts: parseSalts(r.composition ?? ''),
    };
  });

  fuseIndex = new Fuse(allRecords, {
    keys: ['brand_name', 'composition'],
    threshold: 0.3,
    minMatchCharLength: 3,
  });
}

export function searchMedicines(query: string, limit = 10): MedicineSearchResult[] {
  if (!fuseIndex) return [];
  return fuseIndex.search(query, { limit }).map(r => r.item);
}

export function getMedicineByBrand(brand: string): MedicineSearchResult | undefined {
  return allRecords.find(r =>
    r.brand_name.toLowerCase() === brand.toLowerCase()
  );
}

export function getAllRecords(): MedicineSearchResult[] {
  return allRecords;
}
