import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import { searchMedicinesByQuery, extractMedicinesFromImage, getDietaryAdvice, getCombinedDietaryAdvice } from './medicines.service.js';

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

export const dietaryAdvice = asyncHandler(async (req: Request, res: Response) => {
  const rawName = req.params['name'];
  const name = Array.isArray(rawName) ? rawName[0] : rawName;
  if (!name || name.trim().length < 2) {
    res.status(400).json({ success: false, error: 'Medicine name is required' });
    return;
  }
  const result = await getDietaryAdvice(decodeURIComponent(name));
  res.json({ success: true, data: result });
});

export const combinedDietaryAdvice = asyncHandler(async (req: Request, res: Response) => {
  const { medicines, conditionContext } = req.body as {
    medicines: string[];
    conditionContext?: { condition: string; foodsToAvoid: string[]; foodsToEat: string[] }[];
  };
  if (!Array.isArray(medicines) || medicines.length === 0) {
    res.status(400).json({ success: false, error: 'medicines must be a non-empty array' });
    return;
  }
  const result = await getCombinedDietaryAdvice(medicines, conditionContext);
  res.json({ success: true, data: result });
});
