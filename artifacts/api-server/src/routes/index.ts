import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crashlogRouter from "./crashlog";
import coachRouter from "./coach";
import fighterRouter from "./fighter";
import conversationRouter from "./conversation";
import calibrationRouter from "./calibration";
import memoryRouter from "./memory";
import attachmentsRouter from "./attachments";
import plannerRouter from "./planner";
import analysisRouter from "./analysis";
import reportRouter from "./report";
import competitionRouter from "./competition";
import checkinRouter from "./checkin";
import billingRouter from "./billing";
import accountRouter from "./account";
import { googlePublicRouter, googleRouter } from "./google";
import authRouter from "./auth";
import privacyRouter from "./privacy";
import aiConsentRouter from "./aiConsent";
import { requireAuth } from "../middlewares/authMiddleware";
import { requireCurrentAiConsent } from "../lib/aiConsent";

const router: IRouter = Router();

// public — no auth required
router.use(healthRouter);
// Mobile crash + startup reports — no auth so they fire even before auth loads.
router.use(crashlogRouter);
// Custom auth routes — register, login, logout, me
router.use(authRouter);
router.use(privacyRouter);
// Google OAuth callback — Google arrives with no session; identity is
// recovered from the signed `state`, so this MUST stay public.
router.use(googlePublicRouter);

// everything below requires a valid JWT
router.use(requireAuth);

// These authenticated routes must remain reachable without current consent:
// users need to be able to read/update consent and permanently delete their
// account. Auth/sign-out and legal pages are mounted above requireAuth.
router.use(aiConsentRouter);
router.use(accountRouter);

// All other authenticated FRAME use requires the current disclosure. Keep the
// immediate provider-boundary checks in the individual AI services as well.
router.use(requireCurrentAiConsent);

router.use(fighterRouter);
router.use(conversationRouter);
router.use(calibrationRouter);
router.use(memoryRouter);
router.use(attachmentsRouter);
router.use(plannerRouter);
router.use(analysisRouter);
router.use(reportRouter);
router.use(competitionRouter);
router.use(checkinRouter);
router.use(billingRouter);
router.use(googleRouter);
router.use(coachRouter);

export default router;
