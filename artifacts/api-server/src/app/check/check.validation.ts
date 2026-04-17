import { body } from 'express-validator';

export const checkValidation = [
  body('newMedicines')
    .isArray({ min: 1 })
    .withMessage('newMedicines must be a non-empty array'),
  body('newMedicines.*.brand')
    .trim()
    .notEmpty()
    .withMessage('Each medicine must have a brand name'),
  body('newMedicines.*.composition')
    .trim()
    .notEmpty()
    .withMessage('Each medicine must have a composition'),
];
