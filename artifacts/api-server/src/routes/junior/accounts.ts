import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  childGymMembershipsTable,
  childrenTable,
  guardianLinksTable,
  gymsTable,
  juniorAccountsTable,
  juniorConsentsTable,
  observationsTable,
  userRolesTable,
  usersTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory, type Tx } from "../../lib/junior/history";
import { assertGuardian, getApprovedMembership } from "../../lib/junior/authz";
import { deleteChildren } from "../../lib/junior/deleteChildren";
import {
  JUNIOR_ACCOUNT_MIN_AGE,
  JUNIOR_CONSENT_STATEMENT,
  JUNIOR_CONSENT_VERSION,
  JUNIOR_INVITE_TTL_MS,
  JUNIOR_LOGIN_MIN_AGE,
  JUNIOR_MAX_AGE,
  USERNAME_RE,
  ageBandFor,
  ageOn,
  juniorAiEnabledGlobally,
  loginEmailFor,
  PERIOD_DAYS,
  type BoardPeriod,
} from "../../lib/junior/accountConfig";
import { juniorEvents, periodWindow, summarize } from "../../lib/junior/stats";
import { hashToken, newToken } from "./identity";
import { rateLimitCheck, signToken, validatePassword, type RateBucket } from "../auth";

const BCRYPT_ROUNDS = 10;
export const _createStore = new Map<string, RateBucket>();
export const _redeemStore = new Map<string, RateBucket>();

// ── helpers ──────────────────────────────────────────────────────────────────
const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const createBody = z.object({
  displayName: z.string().trim().min(1).max(60),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(isRealDate, "Not a real date"),
  consent: z.object({ accepted: z.literal(true), version: z.string() }),
  login: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("password"), username: z.string().trim().toLowerCase(), password: z.string() }),
      z.object({ mode: z.literal("invite") }),
    ])
    .optional(),
});

function checkUsername(u: string) {
  if (!USERNAME_RE.test(u)) throw new JuniorError(400, "INVALID_USERNAME", "Username: 3-24 letters, numbers, dots or underscores");
}
function checkPassword(p: string) {
  const err = validatePassword(p);
  if (err) throw new JuniorError(400, "INVALID_PASSWORD", err);
}

/** Creates the users row for a junior's login. Never gets a fighter, AI consent or any role row. */
async function insertJuniorUser(tx: Tx, username: string, password: string, displayName: string): Promise<string> {
  const [taken] = await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, loginEmailFor(username)));
  if (taken) throw new JuniorError(409, "USERNAME_TAKEN", "That username is taken");
  const id = crypto.randomUUID();
  await tx.insert(usersTable).values({
    id,
    email: loginEmailFor(username),
    hashedPassword: await bcrypt.hash(password, BCRYPT_ROUNDS),
    displayName,
    isJunior: true,
  });
  return id;
}

const publicJunior = (j: typeof juniorAccountsTable.$inferSelect) => ({
  childId: j.childId,
  username: j.username,
  ageBand: j.ageBand,
  status: j.status,
  hasLogin: !!j.userId,
  aiEnabled: j.aiEnabled && juniorAiEnabledGlobally(),
  lastLoginAt: j.lastLoginAt,
  activatedAt: j.activatedAt,
  pausedAt: j.pausedAt,
});

// ── Parent side ──────────────────────────────────────────────────────────────
const router: IRouter = Router();

router.get("/junior-accounts/rules", h(async (_req, res) => {
  res.json({
    minAge: JUNIOR_ACCOUNT_MIN_AGE,
    loginMinAge: JUNIOR_LOGIN_MIN_AGE,
    maxAge: JUNIOR_MAX_AGE,
    consentVersion: JUNIOR_CONSENT_VERSION,
    consentStatement: JUNIOR_CONSENT_STATEMENT,
    aiChatAvailable: juniorAiEnabledGlobally(),
  });
}));

router.post(
  "/junior-accounts",
  h(async (req, res) => {
    const uid = userId(req);
    const now = nowOf(req);
    if (!rateLimitCheck(`jc:${uid}`, 10, 60 * 60 * 1000, _createStore)) throw new JuniorError(429, "RATE_LIMITED", "Too many requests. Try again later.");
    const b = parse(createBody, req.body);
    if (b.consent.version !== JUNIOR_CONSENT_VERSION) throw new JuniorError(400, "CONSENT_REQUIRED", "Please accept the current parent consent", { version: JUNIOR_CONSENT_VERSION });
    const age = ageOn(b.birthDate, now);
    if (age < 0) throw new JuniorError(422, "INVALID_BIRTH_DATE", "Birth date is in the future");
    if (age < JUNIOR_ACCOUNT_MIN_AGE) throw new JuniorError(422, "AGE_BELOW_MINIMUM", `Junior accounts start at age ${JUNIOR_ACCOUNT_MIN_AGE}`, { minAge: JUNIOR_ACCOUNT_MIN_AGE });
    if (age > JUNIOR_MAX_AGE) throw new JuniorError(422, "AGE_ABOVE_MAXIMUM", "Over-18s need their own FRAME account", { maxAge: JUNIOR_MAX_AGE });
    const canLogin = age >= JUNIOR_LOGIN_MIN_AGE;
    if (b.login && !canLogin) {
      throw new JuniorError(422, "LOGIN_NOT_ALLOWED_AT_AGE", `A junior login is available from age ${JUNIOR_LOGIN_MIN_AGE}. Below that, you manage the account for them.`, { loginMinAge: JUNIOR_LOGIN_MIN_AGE });
    }
    if (b.login?.mode === "password") {
      checkUsername(b.login.username);
      checkPassword(b.login.password);
    }
    const band = ageBandFor(age);
    let inviteCode: string | null = null;

    const out = await db.transaction(async (tx) => {
      const [child] = await tx
        .insert(childrenTable)
        .values({ displayName: b.displayName, birthYearMonth: b.birthDate.slice(0, 7), createdBy: uid })
        .returning();
      const childId = child!.id;
      await tx.insert(guardianLinksTable).values({ childId, userId: uid, invitedBy: uid });
      await tx
        .insert(userRolesTable)
        .values({ userId: uid, role: "parent" })
        .onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: new Date() } });

      let juniorUserId: string | null = null;
      let username: string | null = null;
      let status: "active" | "pending_setup" | "parent_managed" = "parent_managed";
      let inviteHash: string | null = null;
      let inviteExpiresAt: Date | null = null;
      if (b.login?.mode === "password") {
        juniorUserId = await insertJuniorUser(tx, b.login.username, b.login.password, b.displayName);
        username = b.login.username;
        status = "active";
      } else if (b.login?.mode === "invite") {
        inviteCode = newToken();
        inviteHash = hashToken(inviteCode);
        inviteExpiresAt = new Date(now.getTime() + JUNIOR_INVITE_TTL_MS);
        status = "pending_setup";
      }
      const [ja] = await tx
        .insert(juniorAccountsTable)
        .values({
          childId,
          userId: juniorUserId,
          username,
          birthDate: b.birthDate,
          ageBand: band,
          status,
          createdBy: uid,
          inviteTokenHash: inviteHash,
          inviteExpiresAt,
          activatedAt: status === "active" ? now : null,
        })
        .returning();
      await tx.insert(juniorConsentsTable).values({ childId, guardianUserId: uid, version: JUNIOR_CONSENT_VERSION, ageBand: band, statement: JUNIOR_CONSENT_STATEMENT, consentedAt: now });
      await recordHistory(tx, { childId, actorUserId: uid, actorRole: "parent", entity: "junior_account", entityId: childId, action: "created", after: { status, ageBand: band, consentVersion: JUNIOR_CONSENT_VERSION } });
      return { child: child!, junior: ja! };
    });
    res.status(201).json({ child: { id: out.child.id, displayName: out.child.displayName }, junior: publicJunior(out.junior), inviteCode });
  }),
);

router.get(
  "/junior-accounts",
  h(async (req, res) => {
    const uid = userId(req);
    const rows = await db
      .select({ j: juniorAccountsTable, name: childrenTable.displayName })
      .from(juniorAccountsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, juniorAccountsTable.childId))
      .innerJoin(guardianLinksTable, and(eq(guardianLinksTable.childId, childrenTable.id), eq(guardianLinksTable.userId, uid), eq(guardianLinksTable.status, "active")))
      .where(eq(childrenTable.status, "active"))
      .orderBy(desc(juniorAccountsTable.createdAt));
    res.json({ juniors: rows.map((r) => ({ ...publicJunior(r.j), displayName: r.name })) });
  }),
);

const periodQuery = z.object({ period: z.enum(["week", "month", "term"]).optional() });

/** What a parent sees about their junior's activity. Summary only: no private coach notes, no wellbeing, no other children. */
router.get(
  "/junior-accounts/:childId/summary",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const now = nowOf(req);
    const { period = "week" } = parse(periodQuery, req.query);
    const [row] = await db
      .select({ j: juniorAccountsTable, name: childrenTable.displayName })
      .from(juniorAccountsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, juniorAccountsTable.childId))
      .where(eq(juniorAccountsTable.childId, childId));
    if (!row) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const events = (await juniorEvents(null, [childId], now)).get(childId) ?? [];
    const w = periodWindow(period as BoardPeriod, now);
    const m = summarize(events, w, now);
    const notes = await db
      .select({ id: observationsTable.id, body: observationsTable.body, createdAt: observationsTable.createdAt })
      .from(observationsTable)
      .where(and(eq(observationsTable.childId, childId), eq(observationsTable.visibility, "shared"), eq(observationsTable.status, "active")))
      .orderBy(desc(observationsTable.createdAt))
      .limit(5);
    const membership = await db
      .select({ status: childGymMembershipsTable.status, gymName: gymsTable.name })
      .from(childGymMembershipsTable)
      .innerJoin(gymsTable, eq(gymsTable.id, childGymMembershipsTable.gymId))
      .where(eq(childGymMembershipsTable.childId, childId))
      .orderBy(desc(childGymMembershipsTable.createdAt))
      .limit(1);
    const lastTimes = [m.lastActiveAt, row.j.lastLoginAt].filter((x): x is Date => !!x);
    res.json({
      child: { id: childId, displayName: row.name },
      junior: publicJunior(row.j),
      period,
      periodDays: PERIOD_DAYS[period as BoardPeriod],
      summary: {
        sessions: m.sessions,
        trainingMinutes: m.minutes,
        streakWeeks: m.streak,
        lastActiveAt: lastTimes.length ? new Date(Math.max(...lastTimes.map((d) => d.getTime()))) : null,
      },
      sharedCoachNotes: notes,
      gym: membership[0] ?? null,
    });
  }),
);

router.post(
  "/junior-accounts/:childId/pause",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const { paused } = parse(z.object({ paused: z.boolean() }), req.body);
    await db.transaction(async (tx) => {
      const [j] = await tx.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, childId)).for("update");
      if (!j) throw new JuniorError(404, "NOT_FOUND", "Not found");
      const next = paused ? "paused" : j.userId ? "active" : j.inviteTokenHash ? "pending_setup" : "parent_managed";
      await tx
        .update(juniorAccountsTable)
        .set({ status: next, pausedAt: paused ? new Date() : null, pausedBy: paused ? uid : null })
        .where(eq(juniorAccountsTable.childId, childId));
      await recordHistory(tx, { childId, actorUserId: uid, actorRole: "parent", entity: "junior_account", entityId: childId, action: paused ? "paused" : "resumed", before: { status: j.status }, after: { status: next } });
    });
    res.json({ ok: true });
  }),
);

router.post(
  "/junior-accounts/:childId/reset-password",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const { password } = parse(z.object({ password: z.string() }), req.body);
    checkPassword(password);
    const [j] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, childId));
    if (!j?.userId) throw new JuniorError(404, "NOT_FOUND", "This junior has no login");
    await db.transaction(async (tx) => {
      await tx.update(usersTable).set({ hashedPassword: await bcrypt.hash(password, BCRYPT_ROUNDS), passwordChangedAt: new Date() }).where(eq(usersTable.id, j.userId!));
      await recordHistory(tx, { childId, actorUserId: uid, actorRole: "parent", entity: "junior_account", entityId: childId, action: "password_reset" });
    });
    res.json({ ok: true });
  }),
);

/** AI coach / chat for a junior stays off while the server flag is off, whatever the parent asks. TODO(Harry). */
router.put(
  "/junior-accounts/:childId/ai",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    if (enabled && !juniorAiEnabledGlobally()) throw new JuniorError(403, "AI_NOT_AVAILABLE", "AI coach and chat are not available for junior accounts yet");
    await db.update(juniorAccountsTable).set({ aiEnabled: enabled, chatEnabled: enabled }).where(eq(juniorAccountsTable.childId, childId));
    res.json({ ok: true, enabled });
  }),
);

/** Everything held about the junior account (no password hash). Guardian only. */
router.get(
  "/junior-accounts/:childId/export",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const [j] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, childId));
    if (!j) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const consents = await db.select().from(juniorConsentsTable).where(eq(juniorConsentsTable.childId, childId));
    const events = (await juniorEvents(null, [childId], nowOf(req))).get(childId) ?? [];
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
    res.json({
      exportedAt: nowOf(req),
      child,
      account: { ...publicJunior(j), birthDate: j.birthDate, createdAt: j.createdAt },
      consents,
      sessions: events.map((e) => ({ at: e.at, minutes: e.minutes })),
      note: "Attendance, shared coach notes and mood entries are also in /junior/children/:id/export.",
    });
  }),
);

/** Permanent: the login, the record, logs, consents and history for this junior. */
router.delete(
  "/junior-accounts/:childId",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const [j] = await db.select({ childId: juniorAccountsTable.childId }).from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, childId));
    if (!j) throw new JuniorError(404, "NOT_FOUND", "Not found");
    await db.transaction((tx) => deleteChildren(tx, [childId], uid));
    res.json({ ok: true });
  }),
);

// ── The junior's own (very small) view ───────────────────────────────────────
/** The only thing a junior login can call. First name, own numbers, own gym status: nothing about parents or others. */
router.get(
  "/junior-me",
  h(async (req, res) => {
    const uid = userId(req);
    const now = nowOf(req);
    const [j] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.userId, uid));
    if (!j) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const [child] = await db.select({ name: childrenTable.displayName }).from(childrenTable).where(eq(childrenTable.id, j.childId));
    const events = (await juniorEvents(null, [j.childId], now)).get(j.childId) ?? [];
    const m = summarize(events, periodWindow("week", now), now);
    const gym = await getApprovedMembership(j.childId);
    let gymName: string | null = null;
    if (gym) {
      const [g] = await db.select({ name: gymsTable.name }).from(gymsTable).where(eq(gymsTable.id, gym.gymId));
      gymName = g?.name ?? null;
    }
    res.json({
      junior: { firstName: (child?.name ?? "").split(/\s+/)[0] ?? "", ageBand: j.ageBand },
      gym: gymName,
      week: { sessions: m.sessions, trainingMinutes: m.minutes, streakWeeks: m.streak },
      aiCoach: { available: false },
    });
  }),
);

export default router;

// ── Public: a junior finishes setup from the parent's code ────────────────────
export const publicRouter: IRouter = Router();

publicRouter.post(
  "/junior-setup/redeem",
  h(async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (!rateLimitCheck(ip, 10, 15 * 60 * 1000, _redeemStore)) throw new JuniorError(429, "RATE_LIMITED", "Too many requests. Try again later.");
    const b = parse(z.object({ code: z.string().min(10).max(200), username: z.string().trim().toLowerCase(), password: z.string() }), req.body);
    checkUsername(b.username);
    checkPassword(b.password);
    const now = nowOf(req);
    const out = await db.transaction(async (tx) => {
      const [j] = await tx.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.inviteTokenHash, hashToken(b.code))).for("update");
      if (!j || j.status !== "pending_setup" || !j.inviteExpiresAt || j.inviteExpiresAt.getTime() < now.getTime()) {
        throw new JuniorError(400, "INVALID_CODE", "This setup code is invalid or has expired");
      }
      const [child] = await tx.select({ name: childrenTable.displayName }).from(childrenTable).where(eq(childrenTable.id, j.childId));
      const id = await insertJuniorUser(tx, b.username, b.password, child?.name ?? "");
      await tx
        .update(juniorAccountsTable)
        .set({ userId: id, username: b.username, status: "active", activatedAt: now, inviteTokenHash: null, inviteExpiresAt: null })
        .where(eq(juniorAccountsTable.childId, j.childId));
      await recordHistory(tx, { childId: j.childId, actorUserId: id, actorRole: "system", entity: "junior_account", entityId: j.childId, action: "setup_completed" });
      return id;
    });
    res.status(201).json({ token: await signToken(out, loginEmailFor(b.username)), userId: out });
  }),
);
