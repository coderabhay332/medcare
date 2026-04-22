import mongoose, { Schema } from 'mongoose';
import type { MedicineRecord } from '../../medicines/medicines.dto.js';

/**
 * Mongoose model for the `medicines` collection.
 * Matches the schema produced by import-medicines.mjs.
 *
 * Indexes (created by the import script):
 *   - { url: 1 }           unique sparse
 *   - { brand_name: 1 }
 *   - { composition: 1 }
 *   - text index on brand_name + composition + uses + side_effects
 */
const medicineSchema = new Schema<MedicineRecord>(
  {
    url:               { type: String },
    brand_name:        { type: String, required: true },
    composition:       { type: String },
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
  { timestamps: true }
);

export const Medicine = mongoose.model<MedicineRecord>('Medicine', medicineSchema);
