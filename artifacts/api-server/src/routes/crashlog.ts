import { Router, type IRouter } from "express";
import { z } from "zod";

const CrashPayload = z.object({
  type: z.enum(["crash", "startup"]).default("crash"),
  message: z.string().optional(),
  stack: z.string().optional(),
  context: z.string().optional(),
  appVersion: z.string().optional(),
  platform: z.string().optional(),
  ts: z.string().optional(),
});

const router: IRouter = Router();

router.post("/crash-log", (req, res) => {
  const parsed = CrashPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const data = parsed.data;
  if (data.type === "startup") {
    req.log.info(
      {
        type: "mobile_startup",
        appVersion: data.appVersion,
        platform: data.platform,
        context: data.context,
        ts: data.ts,
      },
      "MOBILE STARTUP PROBE"
    );
  } else {
    req.log.error(
      {
        type: "mobile_crash",
        appVersion: data.appVersion,
        platform: data.platform,
        context: data.context,
        message: data.message,
        stack: data.stack,
        ts: data.ts,
      },
      `MOBILE CRASH — ${data.context ?? "unknown"}: ${data.message ?? "(no message)"}`
    );
  }
  res.json({ ok: true });
});

export default router;
