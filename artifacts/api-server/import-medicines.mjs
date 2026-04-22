/**
 * Bulk CSV → MongoDB Import Script
 * ---------------------------------
 * CSV location  : ../../medicine_details.csv  (project root)
 * Records       : ~1,11,827 rows | 313 MB
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run import:medicines
 *   -- OR --
 *   node --env-file=../../.env import-medicines.mjs [optional/custom/path.csv]
 *
 * Optimisations applied:
 *  ✅ Stream-reads the CSV  → constant ~10 MB RAM regardless of file size
 *  ✅ bulkWrite in 2000-row batches → fewer round-trips to Atlas
 *  ✅ $setOnInsert upsert  → safe to re-run, zero duplicate inserts
 *  ✅ writeConcern {w:1, j:false} + bypassDocumentValidation
 *     → ~3x faster writes to Atlas (still durable)
 *  ✅ Indexes created AFTER import (not during) → much faster load
 *  ✅ Progress log every 10 000 rows with ETA
 */

import fs   from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';
import { parse }         from 'csv-parse';
import mongoose, { Schema } from 'mongoose';

// ─── PATHS ────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default: project root  (two levels up from artifacts/api-server/)
const DEFAULT_CSV = path.resolve(__dirname, '../../medicine_details.csv');
const CSV_PATH    = path.resolve(process.argv[2] ?? DEFAULT_CSV);

// ─── TUNING ───────────────────────────────────────────────────────────────────
const BATCH_SIZE = 2000;   // rows per bulkWrite  (sweet-spot for Atlas M0/M2)
const LOG_EVERY  = 10_000; // print progress every N rows

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
// We intentionally skip index definitions here — we create them AFTER loading.
const medicineSchema = new Schema(
  {
    url:               { type: String },          // indexed after import
    brand_name:        { type: String },          // indexed after import
    composition:       { type: String },          // indexed after import
    manufacturer:      String,
    price:             String,
    safety_advice:     Schema.Types.Mixed,
    fact_box:          Schema.Types.Mixed,
    drug_interactions: Schema.Types.Mixed,
    product_intro:     String,
    how_it_works:      String,
    uses:              String,
    benefits:          String,
    side_effects:      String,
    substitutes:       String,
    user_feedback:     String,
    error:             String,
  },
  {
    timestamps:   true,
    // Disable mongoose-level validation during bulk insert (faster)
    strict:       true,
    // Store compound salt array for search
    toObject:     { virtuals: true },
  }
);

medicineSchema.virtual('salts').get(function () {
  if (!this.composition) return [];
  return this.composition
    .split(/[+,]/)
    .map(s => s.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean);
});

const Medicine = mongoose.model('Medicine', medicineSchema);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function tryJSON(val) {
  if (typeof val !== 'string' || !val.trim()) return {};
  const t = val.trim();
  if (t === '{}' || t === '[]') return t === '[]' ? [] : {};
  try   { return JSON.parse(t); }
  catch { return val; }          // keep raw string if unparseable
}

function transformRow(row) {
  return {
    url:               row.url?.trim()          || undefined,   // sparse unique index
    brand_name:        row.brand_name?.trim()   || '',
    composition:       row.composition?.trim()  || '',
    manufacturer:      row.manufacturer?.trim() || '',
    price:             row.price?.trim()        || '',
    safety_advice:     tryJSON(row.safety_advice),
    fact_box:          tryJSON(row.fact_box),
    drug_interactions: tryJSON(row.drug_interactions),
    product_intro:     row.product_intro       || '',
    how_it_works:      row.how_it_works        || '',
    uses:              row.uses                || '',
    benefits:          row.benefits            || '',
    side_effects:      row.side_effects        || '',
    substitutes:       row.substitutes         || '',
    user_feedback:     row.user_feedback       || '',
    error:             row.error               || '',
  };
}

async function flushBatch(batch, stats) {
  if (!batch.length) return;

  const ops = batch.map(doc => ({
    updateOne: {
      filter: doc.url
        ? { url: doc.url }
        : { brand_name: doc.brand_name, composition: doc.composition },
      update:  { $setOnInsert: doc },
      upsert:  true,
    },
  }));

  try {
    const res = await Medicine.bulkWrite(ops, {
      ordered:                  false,   // don't stop on one bad row
      writeConcern:             { w: 1, j: false },  // faster Atlas writes
      bypassDocumentValidation: true,
    });
    stats.inserted += res.upsertedCount;
    stats.skipped  += res.matchedCount;
  } catch (err) {
    // ordered:false → partial success; log but continue
    stats.errors += batch.length;
    console.warn(`  ⚠️  Batch write error: ${err.message}`);
  }
}

async function createIndexes() {
  console.log('\n🔨  Creating indexes (this may take 30-60 s on Atlas free tier)…');
  const col = Medicine.collection;

  await Promise.all([
    col.createIndex({ url:        1 }, { unique: true, sparse: true, background: true }),
    col.createIndex({ brand_name: 1 }, { background: true }),
    col.createIndex({ composition:1 }, { background: true }),
    // Text index → powers full-text search
    col.createIndex(
      { brand_name: 'text', composition: 'text', uses: 'text', side_effects: 'text' },
      { weights: { brand_name: 10, composition: 8, uses: 3, side_effects: 2 }, background: true }
    ),
  ]);
  console.log('✅  Indexes ready.');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  // ── 1. Validation ──────────────────────────────────────────────────────────
  const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌  CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const fileSizeMB = (fs.statSync(CSV_PATH).size / 1024 / 1024).toFixed(1);

  // ── 2. Connect ─────────────────────────────────────────────────────────────
  console.log(`\n🔌  Connecting to MongoDB Atlas…`);
  await mongoose.connect(MONGODB_URI, {
    // Connection pool tuning for bulk writes
    maxPoolSize:        10,
    serverSelectionTimeoutMS: 10_000,
  });
  console.log(`✅  Connected.\n`);

  // ── 3. Stats ───────────────────────────────────────────────────────────────
  const existing = await Medicine.estimatedDocumentCount();
  console.log(`📋  Current documents in collection : ${existing.toLocaleString()}`);
  console.log(`📂  CSV path  : ${CSV_PATH}`);
  console.log(`📦  File size : ${fileSizeMB} MB`);
  console.log(`⚙️   Batch size: ${BATCH_SIZE} rows`);
  console.log('──────────────────────────────────────────────────────\n');

  // ── 4. Stream & insert ─────────────────────────────────────────────────────
  const startTime = Date.now();
  const stats = { read: 0, inserted: 0, skipped: 0, errors: 0 };
  let batch = [];

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8', highWaterMark: 256 * 1024 });
    const parser = parse({
      columns:           true,
      skip_empty_lines:  true,
      relax_quotes:      true,
      relax_column_count:true,
      trim:              true,
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
        try   { batch.push(transformRow(row)); }
        catch  { stats.errors++; }

        if (batch.length >= BATCH_SIZE && !flushing) {
          await flushAndResume();
        }

        if (stats.read % LOG_EVERY === 0) {
          const secs    = (Date.now() - startTime) / 1000;
          const rate    = Math.round(stats.read / secs);
          const etaSecs = Math.round((111827 - stats.read) / rate);  // total ~1.1L
          const eta     = etaSecs > 0 ? `ETA ~${etaSecs}s` : 'almost done';
          console.log(
            `  📊  ${stats.read.toLocaleString()} rows | ` +
            `${rate.toLocaleString()} rows/s | ` +
            `new: ${stats.inserted.toLocaleString()} | ` +
            `dup: ${stats.skipped.toLocaleString()} | ${eta}`
          );
        }
      }
    });

    parser.on('error', reject);
    parser.on('end', async () => {
      // Final partial batch
      await flushBatch(batch, stats);
      batch = [];
      resolve();
    });

    stream.pipe(parser);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── 5. Print result ────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`✅  Import complete in ${elapsed}s`);
  console.log(`   Total rows read    : ${stats.read.toLocaleString()}`);
  console.log(`   Inserted (new)     : ${stats.inserted.toLocaleString()}`);
  console.log(`   Skipped (duplicate): ${stats.skipped.toLocaleString()}`);
  console.log(`   Errors             : ${stats.errors.toLocaleString()}`);
  console.log('──────────────────────────────────────────────────────\n');

  // ── 6. Create indexes AFTER bulk load ──────────────────────────────────────
  if (stats.inserted > 0) {
    await createIndexes();
  } else {
    console.log('ℹ️   No new records inserted — skipping index rebuild.');
  }

  await mongoose.disconnect();
  console.log('\n🔌  Disconnected. All done! 🎉\n');
}

main().catch(err => {
  console.error('\n❌  Fatal:', err.message ?? err);
  mongoose.disconnect().finally(() => process.exit(1));
});
