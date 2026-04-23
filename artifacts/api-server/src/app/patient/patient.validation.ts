import { body, param } from 'express-validator';

export const updateProfileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('age').optional().isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('bloodGroup').optional().isString(),
  body('allergies').optional().isArray(),
  body('conditions').optional().isArray(),
  body('labResults').optional().isArray(),
  body('labResults.*.name').optional({ nullable: true }).isString(),
  body('labResults.*.value').optional({ nullable: true }).isString(),
  body('labResults.*.unit').optional({ nullable: true }).isString(),
];

export const addMedicationValidation = [
  body('name').trim().notEmpty().withMessage('Medicine name is required'),
  body('salt').optional().trim().isString(),
  body('dosage').optional().trim().isString(),
  body('frequency').optional().trim().isString(),
];

export const medicationIdValidation = [
  param('medId').isMongoId().withMessage('Invalid medication ID'),
];
