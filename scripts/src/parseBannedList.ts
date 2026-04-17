import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function extractPdfText(pdfPath: string): Promise<string> {
  // Use pdf-parse to extract text
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  return data.text;
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

  // Process in chunks due to token limits — split by ~6000 chars each
  const CHUNK_SIZE = 6000;
  const chunks: string[] = [];
  for (let i = 0; i < pdfText.length; i += CHUNK_SIZE) {
    chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Processing ${chunks.length} chunks with Claude...`);

  const allEntries: Array<{ id: number; combination: string[]; gazette_ref: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: `Parse this Indian Ministry of Health banned drugs list into a JSON array.

For each numbered entry extract:
- "id": the serial number (integer)
- "combination": array of drug/salt names (lowercase, no dosages, no salt forms like hydrochloride, no parenthetical notes)
- "gazette_ref": the notification number and date as a single string

Rules:
- Only include entries that have a clear serial number
- For entries like "Fixed dose combinations of X with Y", include both X and Y in combination
- Skip entries that describe categories without specific drug names (use generic names like "antihistamine", "analgesic" etc.)
- If gazette_ref mentions "Substituted vide ...", use that reference
- Return ONLY a valid JSON array. No markdown, no explanation, no backticks, no comments.
- If no entries are found in this chunk, return: []

Text:
${chunk}`,
          },
        ],
      });

      const text = (response.content[0] as { type: string; text: string }).text.trim();

      // Strip any accidental markdown
      const cleaned = text.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();

      if (cleaned === '[]' || cleaned === '') {
        continue;
      }

      const entries = JSON.parse(cleaned) as Array<{
        id: number;
        combination: string[];
        gazette_ref: string;
      }>;

      // Deduplicate by id
      for (const entry of entries) {
        if (!allEntries.find(e => e.id === entry.id)) {
          allEntries.push(entry);
        }
      }

      console.log(`  Found ${entries.length} entries in chunk ${i + 1} (total: ${allEntries.length})`);
    } catch (err) {
      console.error(`  Error processing chunk ${i + 1}:`, err);
    }
  }

  // Sort by id
  allEntries.sort((a, b) => a.id - b.id);

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(allEntries, null, 2));
  console.log(`\nDone! Generated ${allEntries.length} banned FDC entries`);
  console.log(`Output written to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
