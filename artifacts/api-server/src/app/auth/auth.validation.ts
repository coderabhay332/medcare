import { body } from 'express-validator';

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().toLowerCase().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('age')
    .optional()
    .isInt({ min: 1, max: 120 })
    .withMessage('Age must be between 1 and 120'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),
  body('bloodGroup').optional().isString(),
  body('allergies').optional().isArray(),
  body('conditions').optional().isArray(),
];

export const loginValidation = [
  body('email').isEmail().toLowerCase().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];
