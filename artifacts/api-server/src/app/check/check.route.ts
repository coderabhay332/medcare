import { Router } from 'express';
import { check } from './check.controller.js';
import { authenticate } from '../common/middleware/authenticate.js';
import { checkValidation } from './check.validation.js';

const router = Router();

router.use(authenticate);
router.post('/', checkValidation, check);

export default router;
