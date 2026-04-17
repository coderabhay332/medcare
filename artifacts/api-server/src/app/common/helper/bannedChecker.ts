import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BannedEntry {
  id: number;
  combination: string[];
  gazette_ref: string;
}

let bannedList: BannedEntry[] = [];

function loadBannedList(): void {
  const bannedPath = path.join(__dirname, '../../../../data/banned_fdcs.json');
  if (fs.existsSync(bannedPath)) {
    const raw = fs.readFileSync(bannedPath, 'utf8');
    bannedList = JSON.parse(raw) as BannedEntry[];
  }
}

loadBannedList();

export function checkBanned(salts: string[]): BannedEntry[] {
  const saltSet = new Set(salts.map(s => s.toLowerCase()));
  return bannedList.filter(entry =>
    entry.combination.every(s => saltSet.has(s.toLowerCase()))
  );
}

export function reloadBannedList(): void {
  loadBannedList();
}
