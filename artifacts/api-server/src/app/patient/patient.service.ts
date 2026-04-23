import { PatientModel } from './patient.schema.js';
import type { IPatient, IConditionRecord, ILabResult, IReportSummary } from './patient.schema.js';
import type { UpdatePatientDTO, AddMedicationDTO } from './patient.dto.js';
import mongoose from 'mongoose';


export async function getPatientById(id: string): Promise<IPatient | null> {
  return PatientModel.findById(id).exec();
}

export async function updatePatientProfile(
  id: string,
  dto: UpdatePatientDTO
): Promise<IPatient | null> {
  return PatientModel.findByIdAndUpdate(
    id,
    { $set: dto },
    { new: true, runValidators: true }
  ).exec();
}

export async function addMedication(
  patientId: string,
  dto: AddMedicationDTO
): Promise<IPatient | null> {
  return PatientModel.findByIdAndUpdate(
    patientId,
    {
      $push: {
        currentMedications: {
          name:      dto.name,
          salt:      dto.salt,
          dosage:    dto.dosage,
          frequency: dto.frequency,
          addedAt:   new Date(),
        },
      },
    },
    { new: true }
  ).exec();
}

export async function removeMedication(
  patientId: string,
  medId: string
): Promise<IPatient | null> {
  return PatientModel.findByIdAndUpdate(
    patientId,
    {
      $pull: {
        currentMedications: { _id: new mongoose.Types.ObjectId(medId) },
      },
    },
    { new: true }
  ).exec();
}

/**
 * Marks a condition as recovered:
 *  - Sets resolvedAt on the matching conditionRecord
 *  - Removes it from the flat conditions[] array (so check engine no longer sees it)
 */
export async function resolveCondition(
  patientId: string,
  conditionName: string
): Promise<IPatient | null> {
  // Step 1: set resolvedAt on the matching conditionRecord
  await PatientModel.updateOne(
    { _id: patientId, 'conditionRecords.name': conditionName },
    { $set: { 'conditionRecords.$.resolvedAt': new Date() } }
  ).exec();

  // Step 2: remove from the flat conditions[] so check engine no longer flags it
  return PatientModel.findByIdAndUpdate(
    patientId,
    { $pull: { conditions: conditionName } },
    { new: true }
  ).exec();
}

/**
 * Pushes new IConditionRecord entries extracted from a report.
 * Deduplicates by name — does not add a record if one already exists.
 * Also syncs name into conditions[] if not already present.
 */
export async function addConditionRecords(
  patientId: string,
  records: Omit<IConditionRecord, never>[]
): Promise<IPatient | null> {
  const patient = await PatientModel.findById(patientId).exec();
  if (!patient) return null;

  const existingNames = new Set(
    patient.conditionRecords.map((r) => r.name.toLowerCase())
  );
  const existingConditions = new Set(
    patient.conditions.map((c) => c.toLowerCase())
  );

  const newRecords: IConditionRecord[] = [];
  const newConditions: string[] = [];

  for (const rec of records) {
    if (!existingNames.has(rec.name.toLowerCase())) {
      newRecords.push(rec);
      existingNames.add(rec.name.toLowerCase());
    }
    if (!existingConditions.has(rec.name.toLowerCase())) {
      newConditions.push(rec.name);
      existingConditions.add(rec.name.toLowerCase());
    }
  }

  const update: Record<string, unknown> = {};
  if (newRecords.length > 0) update['$push'] = { conditionRecords: { $each: newRecords } };
  if (newConditions.length > 0) {
    update['$addToSet'] = { conditions: { $each: newConditions } };
  }

  if (Object.keys(update).length === 0) return patient;

  // Can't use $push and $addToSet in one update — do sequentially
  if (newRecords.length > 0) {
    await PatientModel.findByIdAndUpdate(
      patientId,
      { $push: { conditionRecords: { $each: newRecords } } }
    ).exec();
  }
  if (newConditions.length > 0) {
    await PatientModel.findByIdAndUpdate(
      patientId,
      { $addToSet: { conditions: { $each: newConditions } } }
    ).exec();
  }

  return PatientModel.findById(patientId).exec();
}

/**
 * Safely merges data extracted from a medical report into the patient's profile.
 * - $addToSet for conditions and allergies
 * - $push for lab results and report summaries
 * - $set for patient info (only if provided)
 */
export async function saveReportData(
  patientId: string,
  data: {
    patientInfo?: { name?: string; age?: number; gender?: string; bloodGroup?: string };
    conditions?: string[];
    allergies?: string[];
    labResults?: Omit<ILabResult, never>[];
    reportSummary?: Omit<IReportSummary, never>;
  }
): Promise<IPatient | null> {
  const patient = await PatientModel.findById(patientId).exec();
  if (!patient) return null;

  // 1. Prepare push and addToSet operations
  const pushOps: Record<string, any> = {};
  const addToSetOps: Record<string, any> = {};
  const setOps: Record<string, any> = {};

  if (data.labResults && data.labResults.length > 0) {
    pushOps['labResults'] = { $each: data.labResults };
  }
  if (data.reportSummary) {
    pushOps['reportSummaries'] = data.reportSummary;
  }
  if (data.conditions && data.conditions.length > 0) {
    addToSetOps['conditions'] = { $each: data.conditions };
  }
  if (data.allergies && data.allergies.length > 0) {
    addToSetOps['allergies'] = { $each: data.allergies };
  }

  // 2. Prepare set operations (only overwrite if patient doesn't already have it, or user explicitly confirms)
  // For simplicity, we just $set what's provided since the user opted in via UI.
  if (data.patientInfo) {
    if (data.patientInfo.name) setOps['name'] = data.patientInfo.name;
    if (data.patientInfo.age) setOps['age'] = data.patientInfo.age;
    if (data.patientInfo.gender) setOps['gender'] = data.patientInfo.gender;
    if (data.patientInfo.bloodGroup) setOps['bloodGroup'] = data.patientInfo.bloodGroup;
  }

  // 3. Execute updates sequentially because Mongoose/MongoDB doesn't allow overlapping update paths easily in one go
  // Though here, keys are distinct (labResults vs conditions vs name), so we CAN do it in one query if we want.
  const updateDoc: Record<string, any> = {};
  if (Object.keys(pushOps).length > 0) updateDoc['$push'] = pushOps;
  if (Object.keys(addToSetOps).length > 0) updateDoc['$addToSet'] = addToSetOps;
  if (Object.keys(setOps).length > 0) updateDoc['$set'] = setOps;

  if (Object.keys(updateDoc).length > 0) {
    await PatientModel.findByIdAndUpdate(patientId, updateDoc).exec();
  }

  return PatientModel.findById(patientId).exec();
}

