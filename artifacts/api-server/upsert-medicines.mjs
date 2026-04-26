/**
 * Bulk CSV/TSV → MongoDB Upsert Script
 * -------------------------------------
 * Refreshes existing Medicine docs and inserts new ones.
 * Unlike import-medicines.mjs (which uses $setOnInsert and skips dupes),
 * this script uses $set so re-runs pull in updated catalog data.
 *
 * Usage:
 *   node --env-file=../../.env upsert-medicines.mjs <path/to/file.csv|.tsv>
 *
 * Auto-detects delimiter from the first line (tab vs comma).
 * Fixes UTF-8-as-latin-1 mojibake (Â°C → °C, â€œ → ").
 * Upserts by `url` (preferred) or by (brand_name + composition) when url missing.
 * Preserves Medicine._id so CheckHistory references remain valid.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import mongoose, { Schema } from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(process.argv[2] ?? path.resolve(__dirname, '../../medicine_details.csv'));

const BATCH_SIZE = 2000;
const LOG_EVERY = 10_000;

const medicineSchema = new Schema(
  {
    url: { type: String },
    brand_name: { type: String },
    composition: { type: String },
    manufacturer: String,
    price: String,
    safety_advice: Schema.Types.Mixed,
    fact_box: Schema.Types.Mixed,
    drug_interactions: Schema.Types.Mixed,
    product_intro: String,
    how_it_works: String,
    uses: String,
    benefits: String,
    side_effects: String,
    substitutes: String,
    user_feedback: String,
    storage: String,
    quick_tips: String,
    faqs: Schema.Types.Mixed,
    references: Schema.Types.Mixed,
    marketer_details: Schema.Types.Mixed,
    prescription_required: Boolean,
    therapeutic_class: String,
    error: String,
  },
  { timestamps: true, strict: false }
);

const Medicine = mongoose.model('Medicine', medicineSchema);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const MOJIBAKE_PAIRS = [
  ['Â°', '°'],
  ['â€œ', '"'],
  ['â€', '"'],
  ['â€™', "'"],
  ['â€˜', "'"],
  ['â€“', '–'],
  ['â€”', '—'],
  ['â€¢', '•'],
  ['Â', ''],
];

function fixMojibake(s) {
  if (typeof s !== 'string' || !s) return s;
  let out = s;
  for (const [bad, good] of MOJIBAKE_PAIRS) out = out.split(bad).join(good);
  return out;
}

function tryJSON(val) {
  if (typeof val !== 'string' || !val.trim()) return undefined;
  const t = val.trim();
  if (t === '{}') return {};
  if (t === '[]') return [];
  try { return JSON.parse(t); }
  catch { return val; }
}

function parseBool(v) {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().toUpperCase();
  if (t === 'TRUE') return true;
  if (t === 'FALSE') return false;
  return undefined;
}

function transformRow(row) {
  const clean = (k) => fixMojibake(row[k]?.trim?.() ?? row[k]);
  return {
    url: clean('url') || undefined,
    brand_name: clean('brand_name') || '',
    composition: clean('composition') || '',
    manufacturer: clean('manufacturer') || '',
    price: clean('price') || '',
    safety_advice: tryJSON(clean('safety_advice')),
    fact_box: tryJSON(clean('fact_box')),
    drug_interactions: tryJSON(clean('drug_interactions')),
    product_intro: clean('product_intro') || '',
    how_it_works: clean('how_it_works') || '',
    uses: clean('uses') || '',
    benefits: clean('benefits') || '',
    side_effects: clean('side_effects') || '',
    substitutes: tryJSON(clean('substitutes')) ?? clean('substitutes') ?? '',
    user_feedback: clean('user_feedback') || '',
    storage: clean('storage') || '',
    quick_tips: clean('quick_tips') || '',
    faqs: tryJSON(clean('faqs')),
    references: tryJSON(clean('references')),
    marketer_details: tryJSON(clean('marketer_details')),
    prescription_required: parseBool(row.prescription_required),
    therapeutic_class: clean('therapeutic_class') || '',
    error: clean('error') || '',
  };
}

function detectDelimiter(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8192);
  fs.readSync(fd, buf, 0, 8192, 0);
  fs.closeSync(fd);
  const firstLine = buf.toString('utf8').split(/\r?\n/)[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

async function flushBatch(batch, stats) {
  if (!batch.length) return;
  const ops = batch.map((doc) => {
    // Strip undefined so $set doesn't blank existing fields when CSV cell empty
    const $set = {};
    for (const [k, v] of Object.entries(doc)) {
      if (v !== undefined && v !== '') $set[k] = v;
    }
    const filter = doc.url
      ? { url: doc.url }
      : { brand_name: doc.brand_name, composition: doc.composition };
    return { updateOne: { filter, update: { $set }, upsert: true } };
  });

  try {
    const res = await Medicine.bulkWrite(ops, {
      ordered: false,
      writeConcern: { w: 1, j: false },
      bypassDocumentValidation: true,
    });
    stats.inserted += res.upsertedCount;
    stats.updated += res.modifiedCount;
    stats.matched += res.matchedCount;
  } catch (err) {
    stats.errors += batch.length;
    console.warn(`  ⚠️  Batch error: ${err.message}`);
  }
}

async function ensureIndexes() {
  console.log('\n🔨  Ensuring indexes…');
  const col = Medicine.collection;
  await Promise.all([
    col.createIndex({ url: 1 }, { unique: true, sparse: true, background: true }),
    col.createIndex({ brand_name: 1 }, { background: true }),
    col.createIndex({ composition: 1 }, { background: true }),
    col.createIndex(
      { brand_name: 'text', composition: 'text', uses: 'text', side_effects: 'text' },
      {
        weights: { brand_name: 10, composition: 8, uses: 3, side_effects: 2 },
        background: true,
        name: 'medicine_text_index',
      }
    ),
  ]);
  console.log('✅  Indexes ready.');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI not set');
    process.exit(1);
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌  File not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const sizeMB = (fs.statSync(CSV_PATH).size / 1024 / 1024).toFixed(1);
  const delimiter = detectDelimiter(CSV_PATH);

  console.log(`\n🔌  Connecting to MongoDB…`);
  await mongoose.connect(MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 });
  console.log('✅  Connected.\n');

  const existing = await Medicine.estimatedDocumentCount();
  console.log(`📋  Existing docs : ${existing.toLocaleString()}`);
  console.log(`📂  File          : ${CSV_PATH}`);
  console.log(`📦  Size          : ${sizeMB} MB`);
  console.log(`🔤  Delimiter     : ${delimiter === '\t' ? 'TAB (TSV)' : 'COMMA (CSV)'}`);
  console.log(`⚙️   Batch size    : ${BATCH_SIZE}`);
  console.log('──────────────────────────────────────────────────────\n');

  const startTime = Date.now();
  const stats = { read: 0, inserted: 0, updated: 0, matched: 0, errors: 0 };
  let batch = [];

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8', highWaterMark: 256 * 1024 });
    const parser = parse({
      columns: true,
      delimiter,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    });

    let flushing = false;
    const flushAndResume = async () => {
      flushing = true;
      parser.pause();
      const toFlush = batch;
      batch = [];
      await flushBatch(toFlush, stats);
      parser.resume();
      flushing = false;
    };

    parser.on('readable', async () => {
      let row;
      while ((row = parser.read()) !== null) {
        stats.read++;
        try { batch.push(transformRow(row)); }
        catch { stats.errors++; }

        if (batch.length >= BATCH_SIZE && !flushing) {
          await flushAndResume();
        }

        if (stats.read % LOG_EVERY === 0) {
          const secs = (Date.now() - startTime) / 1000;
          const rate = Math.round(stats.read / secs);
          console.log(
            `  📊  ${stats.read.toLocaleString()} rows | ${rate.toLocaleString()} rows/s | ` +
            `new: ${stats.inserted.toLocaleString()} | upd: ${stats.updated.toLocaleString()} | ` +
            `err: ${stats.errors.toLocaleString()}`
          );
        }
      }
    });

    parser.on('error', reject);
    parser.on('end', async () => {
      await flushBatch(batch, stats);
      batch = [];
      resolve();
    });

    stream.pipe(parser);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`✅  Upsert complete in ${elapsed}s`);
  console.log(`   Rows read       : ${stats.read.toLocaleString()}`);
  console.log(`   Inserted (new)  : ${stats.inserted.toLocaleString()}`);
  console.log(`   Updated         : ${stats.updated.toLocaleString()}`);
  console.log(`   Matched (no-op) : ${(stats.matched - stats.updated).toLocaleString()}`);
  console.log(`   Errors          : ${stats.errors.toLocaleString()}`);
  console.log('──────────────────────────────────────────────────────\n');

  await ensureIndexes();
  await mongoose.disconnect();
  console.log('\n🔌  Disconnected.\n');
}

main().catch((err) => {
  console.error('\n❌  Fatal:', err.message ?? err);
  mongoose.disconnect().finally(() => process.exit(1));
});
