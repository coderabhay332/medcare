import { body, param } from 'express-validator';

export const updateProfileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('age').optional().isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('bloodGroup').optional().isString(),
  body('allergies').optional().isArray(),
  body('conditions').optional().isArray(),
];

export const addMedicationValidation = [
  body('brand').trim().notEmpty().withMessage('Brand is required'),
  body('composition').trim().notEmpty().withMessage('Composition is required'),
  body('type')
    .isIn(['chronic', 'vitamin', 'as-needed'])
    .withMessage('Type must be chronic, vitamin, or as-needed'),
];

export const medicationIdValidation = [
  param('medId').isMongoId().withMessage('Invalid medication ID'),
];
