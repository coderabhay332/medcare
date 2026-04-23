import { Router } from 'express';
import multer from 'multer';
import {
  getProfile,
  updateProfile,
  addMedicationToProfile,
  removeMedicationFromProfile,
  parseReport,
  resolvePatientCondition,
  saveConditionRecords,
  saveReportDataHandler,
} from './patient.controller.js';
import { authenticate } from '../common/middleware/authenticate.js';
import {
  updateProfileValidation,
  addMedicationValidation,
  medicationIdValidation,
} from './patient.validation.js';

const router = Router();

// File uploads: memory storage only — no disk writes, 15 MB cap
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfileValidation, updateProfile);
router.post('/medications', addMedicationValidation, addMedicationToProfile);
router.delete('/medications/:medId', medicationIdValidation, removeMedicationFromProfile);
router.post('/parse-report', upload.single('report'), parseReport);

// Condition history
router.patch('/conditions/:name/resolve', resolvePatientCondition);
router.post('/condition-records', saveConditionRecords);
router.post('/report-data', saveReportDataHandler);

export default router;
