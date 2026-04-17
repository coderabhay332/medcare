import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import { searchMedicinesByQuery, extractMedicinesFromImage } from './medicines.service.js';

export const search = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return;
  }

  const q = req.query['q'] as string;
  const results = await searchMedicinesByQuery(q);
  res.json({ success: true, data: results });
});

export const scan = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: 'Image file is required' });
    return;
  }

  const mimeType = file.mimetype;
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
    res.status(400).json({ success: false, error: 'Unsupported image format' });
    return;
  }

  const result = await extractMedicinesFromImage(file.buffer, mimeType);
  res.json({ success: true, data: result });
});
