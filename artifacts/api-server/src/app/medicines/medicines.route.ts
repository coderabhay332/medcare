import { Router } from 'express';
import multer from 'multer';
import { search, scan } from './medicines.controller.js';
import { searchValidation } from './medicines.validation.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/search', searchValidation, search);
router.post('/scan', upload.single('image'), scan);

export default router;
