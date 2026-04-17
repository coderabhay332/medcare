import { PatientModel } from './patient.schema.js';
import type { IPatient } from './patient.schema.js';
import type { UpdatePatientDTO, AddMedicationDTO } from './patient.dto.js';
import { parseSalts } from '../common/helper/saltParser.js';
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
  const salts = parseSalts(dto.composition);
  return PatientModel.findByIdAndUpdate(
    patientId,
    {
      $push: {
        currentMedications: {
          brand: dto.brand,
          composition: dto.composition,
          salts,
          type: dto.type,
          addedOn: new Date(),
          active: true,
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
      $set: {
        'currentMedications.$[elem].active': false,
      },
    },
    {
      arrayFilters: [{ 'elem._id': new mongoose.Types.ObjectId(medId) }],
      new: true,
    }
  ).exec();
}
