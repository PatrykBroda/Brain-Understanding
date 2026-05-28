import { Router, type IRouter } from "express";
import healthRouter from "./health";
import coachRouter from "./coach";
import fighterRouter from "./fighter";
import conversationRouter from "./conversation";
import calibrationRouter from "./calibration";
import memoryRouter from "./memory";
import attachmentsRouter from "./attachments";
import plannerRouter from "./planner";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

// public
router.use(healthRouter);

// everything below requires an authenticated Clerk session
router.use(requireAuth);

router.use(fighterRouter);
router.use(conversationRouter);
router.use(calibrationRouter);
router.use(memoryRouter);
router.use(attachmentsRouter);
router.use(plannerRouter);
router.use(coachRouter);

export default router;
