import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PatientModel } from '../patient/patient.schema.js';
import type { RegisterDTO, AuthResponseDTO } from './auth.dto.js';
import type { IPatient } from '../patient/patient.schema.js';

const SALT_ROUNDS = 10;

function generateToken(patientId: string): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ sub: patientId }, secret, { expiresIn: '7d' });
}

function formatPatient(patient: IPatient & { _id: unknown }): AuthResponseDTO['patient'] {
  return {
    id: String(patient._id),
    name: patient.name,
    email: patient.email,
    age: patient.age,
    gender: patient.gender,
    bloodGroup: patient.bloodGroup,
    allergies: patient.allergies,
    conditions: patient.conditions,
  };
}

export async function registerPatient(dto: RegisterDTO): Promise<AuthResponseDTO> {
  const existing = await PatientModel.findOne({ email: dto.email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already in use') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

  const patient = await PatientModel.create({
    name: dto.name,
    email: dto.email.toLowerCase(),
    passwordHash,
    age: dto.age,
    gender: dto.gender,
    bloodGroup: dto.bloodGroup,
    allergies: dto.allergies ?? [],
    conditions: dto.conditions ?? [],
    currentMedications: [],
  });

  const token = generateToken(String(patient._id));
  return { token, patient: formatPatient(patient) };
}

export async function loginPatient(email: string, password: string): Promise<AuthResponseDTO> {
  const patient = await PatientModel.findOne({ email: email.toLowerCase() });
  if (!patient) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const isValid = await bcrypt.compare(password, patient.passwordHash);
  if (!isValid) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const token = generateToken(String(patient._id));
  return { token, patient: formatPatient(patient) };
}
