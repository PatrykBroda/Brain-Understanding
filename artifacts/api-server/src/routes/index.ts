import { Router, type IRouter } from "express";
import healthRouter from "./health";
import coachRouter from "./coach";
import fighterRouter from "./fighter";
import conversationRouter from "./conversation";
import calibrationRouter from "./calibration";
import memoryRouter from "./memory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fighterRouter);
router.use(conversationRouter);
router.use(calibrationRouter);
router.use(memoryRouter);
router.use(coachRouter);

export default router;
