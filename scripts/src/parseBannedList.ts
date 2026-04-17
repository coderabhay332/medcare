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

async function processChunk(
  client: Anthropic,
  chunk: string,
  chunkIdx: number,
  total: number
): Promise<Array<{ id: number; combination: string[]; gazette_ref: string }>> {
  console.log(`Processing chunk ${chunkIdx + 1}/${total}...`);

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

    if (!entries) {
      console.log(`  Chunk ${chunkIdx + 1}: Could not parse JSON`);
      return [];
    }

    console.log(`  Chunk ${chunkIdx + 1}: Found ${entries.length} entries`);
    return entries;
  } catch (err) {
    console.error(`  Chunk ${chunkIdx + 1} error:`, (err as Error).message);
    return [];
  }
}

function saveProgress(
  allEntries: Map<number, { id: number; combination: string[]; gazette_ref: string }>,
  outputPath: string
): void {
  const sorted = Array.from(allEntries.values()).sort((a, b) => a.id - b.id);
  fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2));
  console.log(`  Saved ${sorted.length} entries to file`);
}

async function main(): Promise<void> {
  const pdfPath = path.join(__dirname, '../../attached_assets/banned_drugs_india_1776405486550.pdf');
  const outputPath = path.join(__dirname, '../../artifacts/api-server/data/banned_fdcs.json');

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at: ${pdfPath}`);
    process.exit(1);
  }

  console.log('Extracting text from PDF...');
  const pdfText = await extractPdfText(pdfPath);
  console.log(`Extracted ${pdfText.length} characters`);

  const client = new Anthropic();

  const CHUNK_SIZE = 3500;
  const chunks: string[] = [];
  for (let i = 0; i < pdfText.length; i += CHUNK_SIZE) {
    chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Processing ${chunks.length} chunks with Claude Haiku...`);

  // Load any existing partial results
  const allEntries: Map<number, { id: number; combination: string[]; gazette_ref: string }> = new Map();
  if (fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Array<{ id: number; combination: string[]; gazette_ref: string }>;
    for (const e of existing) allEntries.set(e.id, e);
    console.log(`Resuming with ${allEntries.size} existing entries`);
  }

  // Process in serial batches, saving after each batch
  const BATCH_SIZE = 3;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((chunk, j) => processChunk(client, chunk, i + j, chunks.length))
    );

    for (const entries of results) {
      for (const entry of entries) {
        if (!allEntries.has(entry.id)) {
          allEntries.set(entry.id, entry);
        }
      }
    }

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks done, ${allEntries.size} unique entries`);
    // Save after every batch
    saveProgress(allEntries, outputPath);
  }

  console.log(`\nDone! Final count: ${allEntries.size} entries`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
