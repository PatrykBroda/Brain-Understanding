import { Router, type IRouter } from "express";
import { getUserFighter } from "../middlewares/authMiddleware";
import { buildWeeklyReport } from "../lib/reportService";

const router: IRouter = Router();

// The FRAME Intelligence Report — a weekly, honest summary of what the athlete
// model learned this week. Every value is derived server-side from real
// recorded evidence; no AI number is emitted here.
router.get("/report/weekly", async (req, res) => {
  // Removed for now at the client's request (19 Oct 2026); the code stays behind this switch
  // until the replacement approach is decided.
  if (process.env["WEEKLY_REPORT_ENABLED"] !== "1") {
    res.status(410).json({ error: "The weekly intelligence report is switched off for now.", code: "FEATURE_DISABLED" });
    return;
  }
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ report: null });
    return;
  }
  try {
    const report = await buildWeeklyReport(fighter);
    res.json({ report });
  } catch (err) {
    req.log.error({ err }, "weekly report build failed");
    res.status(500).json({ error: "could not build weekly report" });
  }
});

export default router;
