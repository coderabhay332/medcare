import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function extractPdfText(pdfPath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  return data.text;
}

function tryParseJSON(text: string): Array<{ id: number; combination: string[]; gazette_ref: string }> | null {
  let cleaned = text.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  const start = cleaned.indexOf('[');
  if (start === -1) return null;
  cleaned = cleaned.slice(start);
  if (!cleaned.endsWith(']')) {
    const lastBrace = cleaned.lastIndexOf('},');
    if (lastBrace !== -1) cleaned = cleaned.slice(0, lastBrace + 1) + ']';
    else {
      const lb2 = cleaned.lastIndexOf('}');
      if (lb2 !== -1) cleaned = cleaned.slice(0, lb2 + 1) + ']';
    }
  }
  try {
    const parsed = JSON.parse(cleaned) as Array<{ id: number; combination: string[]; gazette_ref: string }>;
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function main(): Promise<void> {
  const pdfPath = path.join(__dirname, '../../attached_assets/banned_drugs_india_1776405486550.pdf');
  const outputPath = path.join(__dirname, '../../artifacts/api-server/data/banned_fdcs.json');

  console.log('Extracting text from PDF...');
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  const pdfText = data.text;

  const CHUNK_SIZE = 3500;
  const chunks: string[] = [];
  for (let i = 0; i < pdfText.length; i += CHUNK_SIZE) {
    chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
  }

  // Load existing
  const allEntries: Map<number, { id: number; combination: string[]; gazette_ref: string }> = new Map();
  if (fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Array<{ id: number; combination: string[]; gazette_ref: string }>;
    for (const e of existing) allEntries.set(e.id, e);
    console.log(`Loaded ${allEntries.size} existing entries, processing chunks 13-${chunks.length}`);
  }

  const client = new Anthropic();

  // Only process chunks 12 onward (0-indexed, so index 12 = chunk 13)
  for (let i = 12; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Parse this Indian Ministry of Health banned drugs list into a JSON array.

For each numbered entry extract:
- "id": the serial number (integer)  
- "combination": array of drug/salt names (lowercase, no dosages, no salt forms)
- "gazette_ref": notification number and date as a string

Return ONLY a valid JSON array. No markdown. No explanation. If no entries found, return: []

Text:
${chunk}`,
        }],
      });
      const text = (response.content[0] as { type: string; text: string }).text;
      const entries = tryParseJSON(text);
      if (entries) {
        for (const entry of entries) {
          if (!allEntries.has(entry.id)) allEntries.set(entry.id, entry);
        }
        console.log(`  Found ${entries.length} entries (total: ${allEntries.size})`);
      } else {
        console.log(`  Could not parse JSON from chunk ${i + 1}`);
      }
    } catch (err) {
      console.error(`  Error on chunk ${i + 1}:`, (err as Error).message);
    }
  }

  const sorted = Array.from(allEntries.values()).sort((a, b) => a.id - b.id);
  fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2));
  console.log(`\nDone! ${sorted.length} total entries written to banned_fdcs.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
