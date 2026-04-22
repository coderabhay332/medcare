import { body } from 'express-validator';

export const checkValidation = [
  body('medicines')
    .isArray({ min: 2 })
    .withMessage('Provide at least 2 medicines to check interactions.'),
  body('medicines.*')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Each medicine must be a valid string name'),
];
