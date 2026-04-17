import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "../app/auth/auth.route.js";
import patientRouter from "../app/patient/patient.route.js";
import medicinesRouter from "../app/medicines/medicines.route.js";
import checkRouter from "../app/check/check.route.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/patient", patientRouter);
router.use("/medicines", medicinesRouter);
router.use("/check", checkRouter);

export default router;
