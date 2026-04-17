import mongoose, { type Document, type Schema as SchemaType } from 'mongoose';

export interface IMedication {
  brand: string;
  composition: string;
  salts: string[];
  type: 'chronic' | 'vitamin' | 'as-needed';
  addedOn: Date;
  active: boolean;
}

export interface IPatient extends Document {
  name: string;
  age: number;
  gender: string;
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
  brand: { type: String, required: true },
  composition: { type: String, required: true },
  salts: [{ type: String }],
  type: { type: String, enum: ['chronic', 'vitamin', 'as-needed'], required: true },
  addedOn: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
});

const patientSchema = new mongoose.Schema<IPatient>(
  {
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    bloodGroup: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    allergies: [{ type: String }],
    conditions: [{ type: String }],
    currentMedications: [medicationSchema],
  },
  { timestamps: true }
);

export const PatientModel = mongoose.model<IPatient>('Patient', patientSchema);
