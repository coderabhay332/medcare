import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import {
  getPatientById,
  updatePatientProfile,
  addMedication,
  removeMedication,
} from './patient.service.js';
import type { IPatient } from './patient.schema.js';
import type { UpdatePatientDTO, AddMedicationDTO } from './patient.dto.js';

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user as IPatient;
  const full = await getPatientById(String(patient._id));
  res.json({ success: true, data: full });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const patient = req.user as IPatient;
  const dto = req.body as UpdatePatientDTO;
  const updated = await updatePatientProfile(String(patient._id), dto);
  res.json({ success: true, data: updated });
});

export const addMedicationToProfile = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const patient = req.user as IPatient;
  const dto = req.body as AddMedicationDTO;
  const updated = await addMedication(String(patient._id), dto);
  res.status(201).json({ success: true, data: updated });
});

export const removeMedicationFromProfile = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const patient = req.user as IPatient;
  const { medId } = req.params;
  const updated = await removeMedication(String(patient._id), medId as string);
  res.json({ success: true, data: updated });
});
