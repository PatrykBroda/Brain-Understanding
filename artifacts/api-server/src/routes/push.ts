import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, pushTokensTable, pushPreferencesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { DEFAULT_QUIET_END_MIN, DEFAULT_QUIET_START_MIN } from "../lib/pushLogic";

const router: IRouter = Router();

export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{8,200}\]$/;

const registerBody = z.object({
  token: z.string().regex(EXPO_TOKEN_RE),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

const minute = z.number().int().min(0).max(1439);
const prefsBody = z
  .object({ enabled: z.boolean(), quietStartMin: minute, quietEndMin: minute })
  .partial()
  .refine((b) => Object.keys(b).length > 0);

// Register (or move) this device's Expo token to the signed-in user.
router.post("/push/register", async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid push token" });
    return;
  }
  const { token, platform } = parsed.data;
  await db
    .insert(pushTokensTable)
    .values({ userId: req.userId!, token, platform: platform ?? "" })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId: req.userId!, platform: platform ?? "", updatedAt: new Date() },
    });
  res.json({ ok: true });
});

// Sign-out / permission revoked: forget this device's token for this user.
router.delete("/push/register", async (req, res) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "token required" });
    return;
  }
  await db
    .delete(pushTokensTable)
    .where(and(eq(pushTokensTable.userId, req.userId!), eq(pushTokensTable.token, parsed.data.token)));
  res.json({ ok: true });
});

router.get("/push/preferences", async (req, res) => {
  const [p] = await db.select().from(pushPreferencesTable).where(eq(pushPreferencesTable.userId, req.userId!));
  res.json({
    enabled: p?.enabled ?? true,
    quietStartMin: p?.quietStartMin ?? DEFAULT_QUIET_START_MIN,
    quietEndMin: p?.quietEndMin ?? DEFAULT_QUIET_END_MIN,
  });
});

router.put("/push/preferences", async (req, res) => {
  const parsed = prefsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid preferences" });
    return;
  }
  await db
    .insert(pushPreferencesTable)
    .values({ userId: req.userId!, ...parsed.data })
    .onConflictDoUpdate({
      target: pushPreferencesTable.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    });
  const [p] = await db.select().from(pushPreferencesTable).where(eq(pushPreferencesTable.userId, req.userId!));
  res.json({ enabled: p!.enabled, quietStartMin: p!.quietStartMin, quietEndMin: p!.quietEndMin });
});

export default router;
