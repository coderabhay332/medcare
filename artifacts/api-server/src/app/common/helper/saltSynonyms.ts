import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let synonyms: Record<string, string> = {};

export function getSynonyms(): Record<string, string> {
  if (Object.keys(synonyms).length === 0) {
    const synonymsPath = path.join(__dirname, '../../../../data/salt_synonyms.json');
    if (fs.existsSync(synonymsPath)) {
      const raw = fs.readFileSync(synonymsPath, 'utf8');
      synonyms = JSON.parse(raw) as Record<string, string>;
    }
  }
  return synonyms;
}

export function normalizeSalt(salt: string): string {
  const syns = getSynonyms();
  const lower = salt.toLowerCase().trim();
  return syns[lower] ?? lower;
}
