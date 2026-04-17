import mongoose from 'mongoose';

const checkResultSchema = new mongoose.Schema({
  medicine: { type: String, required: true },
  status: { type: String, enum: ['safe', 'warning', 'banned', 'interaction'], required: true },
  severity: { type: String, enum: ['none', 'mild', 'moderate', 'severe'], required: true },
  reason: { type: String },
  conflictsWith: { type: String, default: null },
  gazette_ref: { type: String, default: null },
  dosageGuidance: { type: String },
  source: { type: String, enum: ['india_gazette', 'openFDA', 'claude', 'unavailable'] },
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
