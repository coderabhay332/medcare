import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import {
  getPatientById,
  updatePatientProfile,
  addMedication,
  removeMedication,
  resolveCondition,
  addConditionRecords,
  saveReportData,
} from './patient.service.js';
import { parseReportFile } from './patient.report.service.js';
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

/**
 * POST /patient/parse-report
 *
 * Accepts a multipart file upload (PDF, JPEG, PNG, WEBP — max 10 MB).
 * Passes the buffer to Claude Sonnet for extraction, then resolves medicine
 * names through the brand→salt pipeline.
 *
 * IMPORTANT: This endpoint does NOT save anything to the database.
 * It returns a preview payload for the user to review and confirm.
 * The raw file buffer is released after this handler returns.
 */
export const parseReport = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ success: false, error: 'No file uploaded. Send a PDF, JPEG, or PNG.' });
    return;
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    res.status(415).json({
      success: false,
      error: `Unsupported file type: ${file.mimetype}. Upload a PDF, JPEG, or PNG.`,
    });
    return;
  }

  // Log only non-sensitive metadata — never log buffer content
  console.info('[report] Received upload —', {
    bytes: file.size,
    mimeType: file.mimetype,
    originalName: file.originalname.replace(/./g, '*').slice(-6), // mask filename
  });

  try {
    const preview = await parseReportFile(file.buffer, file.mimetype);
    // Buffer goes out of scope here - eligible for GC
    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(422).json({
      success: false,
      error: err instanceof Error
        ? err.message
        : 'Could not analyse this report. Please try a clearer PDF or image.',
    });
    return;
  }

});
/**
 * PATCH /patient/conditions/:name/resolve
 * Marks a condition as recovered. Removes it from the check engine's
 * conditions[] and sets resolvedAt on the conditionRecord.
 */
export const resolvePatientCondition = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user as IPatient;
  const rawName = req.params['name'];
  const conditionName = decodeURIComponent(Array.isArray(rawName) ? rawName[0] ?? '' : rawName ?? '');
  if (!conditionName) {
    res.status(400).json({ success: false, error: 'Condition name is required' });
    return;
  }
  const updated = await resolveCondition(String(patient._id), conditionName);
  res.json({ success: true, data: updated });
});

/**
 * POST /patient/condition-records
 * Saves rich condition records (extracted from a report) to the patient profile.
 * Deduplicates by name. Also syncs into the flat conditions[] for the check engine.
 */
export const saveConditionRecords = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user as IPatient;
  const { records } = req.body as { records: Parameters<typeof addConditionRecords>[1] };
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ success: false, error: 'records must be a non-empty array' });
    return;
  }
  const updated = await addConditionRecords(String(patient._id), records);
  res.json({ success: true, data: updated });
});

/**
 * POST /patient/report-data
 * Safely merges new report data into the patient profile.
 * - appends (pushes) lab results and summaries
 * - adds to set for conditions and allergies
 */
export const saveReportDataHandler = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user as IPatient;
  const data = req.body as Parameters<typeof saveReportData>[1];
  
  if (!data) {
    res.status(400).json({ success: false, error: 'No data provided' });
    return;
  }

  const updated = await saveReportData(String(patient._id), data);
  res.json({ success: true, data: updated });
});
