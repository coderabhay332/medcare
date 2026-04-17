import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  addMedicationToProfile,
  removeMedicationFromProfile,
} from './patient.controller.js';
import { authenticate } from '../common/middleware/authenticate.js';
import {
  updateProfileValidation,
  addMedicationValidation,
  medicationIdValidation,
} from './patient.validation.js';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfileValidation, updateProfile);
router.post('/medications', addMedicationValidation, addMedicationToProfile);
router.delete('/medications/:medId', medicationIdValidation, removeMedicationFromProfile);

export default router;
