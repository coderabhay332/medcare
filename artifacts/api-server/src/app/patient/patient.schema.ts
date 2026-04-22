import mongoose, { type Document } from 'mongoose';

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
  conditions: string[];
  currentMedications: (IMedication & { _id: mongoose.Types.ObjectId })[];
  createdAt: Date;
  updatedAt: Date;
}

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
    currentMedications: [medicationSchema],
  },
  { timestamps: true }
);

export const PatientModel = mongoose.model<IPatient>('Patient', patientSchema);
