import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let synonyms: Record<string, string> = {};

function loadSynonyms(): void {
  const synonymsPath = path.join(__dirname, '../../../../data/salt_synonyms.json');
  if (fs.existsSync(synonymsPath)) {
    const raw = fs.readFileSync(synonymsPath, 'utf8');
    synonyms = JSON.parse(raw) as Record<string, string>;
  }
}

loadSynonyms();

export function parseSalts(composition: string): string[] {
  return composition
    .split('+')
    .map(part => part.replace(/\(.*?\)/g, '').trim().toLowerCase())
    .filter(Boolean)
    .map(salt => synonyms[salt] ?? salt);
}
