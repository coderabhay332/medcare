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
    if (lastBrace !== -1) {
      cleaned = cleaned.slice(0, lastBrace + 1) + ']';
    } else {
      const lastBrace2 = cleaned.lastIndexOf('}');
      if (lastBrace2 !== -1) {
        cleaned = cleaned.slice(0, lastBrace2 + 1) + ']';
      }
    }
  }

  try {
    const parsed = JSON.parse(cleaned) as Array<{ id: number; combination: string[]; gazette_ref: string }>;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const pdfPath = path.join(__dirname, '../../attached_assets/banned_drugs_india_1776405486550.pdf');
  const outputPath = path.join(__dirname, '../../artifacts/api-server/data/banned_fdcs.json');

  console.log('Extracting text from PDF...');
  const pdfText = await extractPdfText(pdfPath);

  const CHUNK_SIZE = 3500;
  const chunks: string[] = [];
  for (let i = 0; i < pdfText.length; i += CHUNK_SIZE) {
    chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
  }

  // Load existing entries
  let existing: Array<{ id: number; combination: string[]; gazette_ref: string }> = [];
  if (fs.existsSync(outputPath)) {
    existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as typeof existing;
    console.log(`Loaded ${existing.length} existing entries`);
  }

  const allEntries: Map<number, { id: number; combination: string[]; gazette_ref: string }> = new Map();
  for (const e of existing) allEntries.set(e.id, e);

  // Only process chunks 12-15 (0-indexed)
  const remainingChunks = chunks.slice(12);
  console.log(`Processing ${remainingChunks.length} remaining chunks...`);

  const client = new Anthropic();

  for (let i = 0; i < remainingChunks.length; i++) {
    const chunk = remainingChunks[i];
    console.log(`Processing chunk ${13 + i}/${chunks.length}...`);

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: `Parse this Indian Ministry of Health banned drugs list into a JSON array.

For each numbered entry extract:
- "id": the serial number (integer)
- "combination": array of drug/salt names (lowercase, no dosages, no salt forms)
- "gazette_ref": notification number and date as a string

Return ONLY a valid JSON array. No markdown, no explanation.
If no entries found, return: []

Text:
${chunk}`,
          },
        ],
      });

      const text = (response.content[0] as { type: string; text: string }).text;
      const entries = tryParseJSON(text);

      if (entries) {
        for (const entry of entries) {
          if (!allEntries.has(entry.id)) {
            allEntries.set(entry.id, entry);
          }
        }
        console.log(`  Found ${entries.length} entries (total: ${allEntries.size})`);
      }
    } catch (err) {
      console.error(`  Error:`, (err as Error).message);
    }
  }

  const sorted = Array.from(allEntries.values()).sort((a, b) => a.id - b.id);
  fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2));
  console.log(`\nFinal: ${sorted.length} entries written to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
