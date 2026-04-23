import mongoose, { type Document } from 'mongoose';

export interface ILabResult {
  name: string;   // e.g. "HbA1c", "Serum Creatinine", "Blood Pressure (Systolic)"
  value: string;  // e.g. "7.2", "1.1", "138"
  unit: string;   // e.g. "%", "mg/dL", "mmHg"
  status?: string; // e.g. "High", "Low", "Normal", "Abnormal"
  referenceRange?: string; // e.g. "4.0 - 5.6"
  date?: Date;
}

export interface IReportSummary {
  date: Date;
  summary: string;
  keyFindings?: IReportFinding[];
  foodsToEat?: string[];
  foodsToAvoid?: string[];
  precautions?: string[];
  followUpQuestions?: string[];
  urgentWarnings?: string[];
}

export interface IReportFinding {
  title: string;
  evidence?: string;
  meaning: string;
  severity: 'normal' | 'watch' | 'needs_attention' | 'urgent';
}

export interface IConditionRecord {
  name: string;                    // e.g. "Iron Deficiency Anemia"
  diagnosedAt?: Date;              // extracted from report or Date.now() for manual
  resolvedAt?: Date;               // set when patient marks as recovered
  source: 'manual' | 'report';    // where this was added from
  precautions: string[];           // Claude-extracted: ["Avoid tea with meals", …]
  foodsToAvoid: string[];          // Claude-extracted: ["Tea", "Coffee", …]
  foodsToEat: string[];            // Claude-extracted: ["Spinach", "Lentils", …]
}

export interface IMedication {
  name: string;
  salt?: string;
  dosage?: string;
  frequency?: string;
  addedAt: Date;
}

export interface IPatient extends Document {
  name: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  email: string;
  passwordHash: string;
  allergies: string[];
  conditions: string[];   // simple string list — used by check engine (do not remove)
  conditionRecords: (IConditionRecord & { _id: mongoose.Types.ObjectId })[];
  currentMedications: (IMedication & { _id: mongoose.Types.ObjectId })[];
  labResults: (ILabResult & { _id: mongoose.Types.ObjectId })[];
  reportSummaries: (IReportSummary & { _id: mongoose.Types.ObjectId })[];
  createdAt: Date;
  updatedAt: Date;
}

const labResultSchema = new mongoose.Schema<ILabResult>({
  name:  { type: String, required: true },
  value: { type: String, required: true },
  unit:  { type: String, default: '' },
  status: { type: String },
  referenceRange: { type: String },
  date:  { type: Date },
});

const reportSummarySchema = new mongoose.Schema<IReportSummary>({
  date:    { type: Date, required: true },
  summary: { type: String, required: true },
  keyFindings: [{
    title:    { type: String, required: true },
    evidence: { type: String },
    meaning:  { type: String, required: true },
    severity: {
      type: String,
      enum: ['normal', 'watch', 'needs_attention', 'urgent'],
      default: 'watch',
    },
  }],
  foodsToEat:       [{ type: String }],
  foodsToAvoid:     [{ type: String }],
  precautions:      [{ type: String }],
  followUpQuestions:[{ type: String }],
  urgentWarnings:   [{ type: String }],
});

const conditionRecordSchema = new mongoose.Schema<IConditionRecord>({
  name:        { type: String, required: true },
  diagnosedAt: { type: Date },
  resolvedAt:  { type: Date },
  source:      { type: String, enum: ['manual', 'report'], default: 'manual' },
  precautions:  [{ type: String }],
  foodsToAvoid: [{ type: String }],
  foodsToEat:   [{ type: String }],
});

const medicationSchema = new mongoose.Schema<IMedication>({
  name:      { type: String, required: true },
  salt:      { type: String },
  dosage:    { type: String },
  frequency: { type: String },
  addedAt:   { type: Date, default: Date.now },
});

const patientSchema = new mongoose.Schema<IPatient>(
  {
    name:        { type: String, required: true },
    age:         { type: Number },
    gender:      { type: String },
    bloodGroup:  { type: String },
    email:       { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    allergies:   [{ type: String }],
    conditions:  [{ type: String }],
    conditionRecords: [conditionRecordSchema],
    currentMedications: [medicationSchema],
    labResults:  [labResultSchema],
    reportSummaries: [reportSummarySchema],
  },
  { timestamps: true }
);

export const PatientModel = mongoose.model<IPatient>('Patient', patientSchema);
