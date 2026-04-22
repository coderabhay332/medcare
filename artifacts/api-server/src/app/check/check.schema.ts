import mongoose from 'mongoose';

const checkResultSchema = new mongoose.Schema({
  medicine: { type: String, required: true },
  status: { type: String, enum: ['safe', 'warning', 'banned', 'interaction'], required: true },
  severity: { type: String, enum: ['none', 'mild', 'moderate', 'severe'], required: true },
  reason: { type: String },
  conflictsWith: { type: String, default: null },
  gazette_ref: { type: String, default: null },
  dosageGuidance: { type: String },
  source: { type: String, enum: ['india_gazette', 'openFDA', 'rxnav', 'claude', 'organ_burden', 'unavailable'] },
});

const checkHistorySchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    checkedAt: { type: Date, default: Date.now },
    newMedicines: [{ brand: String, composition: String, salts: [String] }],
    existingMedicines: [{ brand: String, composition: String, salts: [String] }],
    results: [checkResultSchema],
  },
  { timestamps: false }
);

export const CheckHistoryModel = mongoose.model('CheckHistory', checkHistorySchema);

const bannedExplanationSchema = new mongoose.Schema(
  {
    combinationHash: { type: String, required: true, unique: true },
    explanation: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const BannedExplanationModel = mongoose.model('BannedExplanation', bannedExplanationSchema);

const dietaryAdviceSchema = new mongoose.Schema(
  {
    medicineKey: { type: String, required: true, unique: true }, // lower-cased medicine name
    items: [
      {
        category: { type: String }, // e.g. "Foods", "Drinks", "Lifestyle"
        avoid: [{ type: String }],  // list of specific things to avoid
        reason: { type: String },   // short medical reason
      },
    ],
    rawAdvice: { type: String },    // full plain-text fallback
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const DietaryAdviceModel = mongoose.model('DietaryAdvice', dietaryAdviceSchema);

const combinedDietarySchema = new mongoose.Schema(
  {
    medicinesHash: { type: String, required: true, unique: true },
    avoid: [
      {
        category: String,
        items: [{ name: String, severity: { type: String, enum: ['high', 'moderate', 'low'] }, timingContext: String }],
        reason: String,
      },
    ],
    safeToEat: [{ type: String }],
    mealSchedule: [{ medicine: String, timing: String, note: String }],
    medicineTips: [{ medicine: String, tip: String }],
    generalTips: [{ type: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const CombinedDietaryAdviceModel = mongoose.model('CombinedDietaryAdvice', combinedDietarySchema);

// ── RxNorm / RxNav caches ────────────────────────────────────────────────────

/** Cache: salt name (normalised) → RxCUI string */
const rxCuiCacheSchema = new mongoose.Schema(
  {
    saltKey: { type: String, required: true, unique: true }, // lower-cased RxNorm name
    rxcui: { type: String, default: null },                 // null = confirmed not found
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
export const RxCuiCacheModel = mongoose.model('RxCuiCache', rxCuiCacheSchema);

/** Cache: sorted pair hash → RxNav interaction result */
const rxNavCacheSchema = new mongoose.Schema(
  {
    pairHash: { type: String, required: true, unique: true }, // "cuiA|cuiB" sorted
    found: { type: Boolean, required: true },
    description: { type: String, default: '' },
    severity: { type: String, default: '' }, // 'high','moderate','low','unknown'
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
export const RxNavCacheModel = mongoose.model('RxNavCache', rxNavCacheSchema);
