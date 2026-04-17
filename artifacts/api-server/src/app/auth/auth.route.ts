import { Router } from 'express';
import { register, login } from './auth.controller.js';
import { registerValidation, loginValidation } from './auth.validation.js';

const router = Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);

export default router;
