import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import { performCheck } from './check.service.js';
import type { IPatient } from '../patient/patient.schema.js';
import type { CheckRequestDTO } from './check.dto.js';

export const check = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const patient = req.user as IPatient;
  const dto = req.body as CheckRequestDTO;
  const result = await performCheck(String(patient._id), dto);
  res.json({ success: true, data: result });
});
