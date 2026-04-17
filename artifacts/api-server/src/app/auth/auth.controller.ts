import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import { registerPatient, loginPatient } from './auth.service.js';
import type { RegisterDTO, LoginDTO } from './auth.dto.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const dto = req.body as RegisterDTO;
  const result = await registerPatient(dto);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const { email, password } = req.body as LoginDTO;
  const result = await loginPatient(email, password);
  res.status(200).json({ success: true, data: result });
});
