import { PatientModel } from './patient.schema.js';
import type { IPatient } from './patient.schema.js';
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
