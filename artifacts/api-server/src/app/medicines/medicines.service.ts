import { searchMedicines } from '../common/services/medicineIndex.js';
import { claude, SONNET } from '../common/services/claudeClient.js';
import type { MedicineSearchResult, ScanResultDTO } from './medicines.dto.js';

export async function searchMedicinesByQuery(query: string): Promise<MedicineSearchResult[]> {
  return searchMedicines(query, 10);
}

export async function extractMedicinesFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ScanResultDTO> {
  const base64 = imageBuffer.toString('base64');

  let extracted: string[] = [];

  try {
    const response = await claude.messages.create({
      model: SONNET,
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `This is either a doctor's prescription or medicine packaging.
Extract all medicine and drug names visible in this image.
Return ONLY a JSON array of strings.
Example: ["Dolo 650", "Ascoril D Plus", "Metformin 500mg"]
If no medicine names are visible, return: []
No explanation. No markdown. Just the JSON array.`,
            },
          ],
        },
      ],
    });

    const text = (response.content[0] as { text: string }).text;
    extracted = JSON.parse(text) as string[];
  } catch {
    extracted = [];
  }

  const matched: Array<MedicineSearchResult & { confidence: number }> = [];
  const unmatched: string[] = [];

  for (const name of extracted) {
    const results = searchMedicines(name, 1);
    if (results.length > 0) {
      matched.push({ ...results[0], confidence: 0.9 });
    } else {
      unmatched.push(name);
    }
  }

  return { extracted, matched, unmatched };
}
