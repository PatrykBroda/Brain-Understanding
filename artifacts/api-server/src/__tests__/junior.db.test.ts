/**
 * Junior Portal pilot against a REAL Postgres: permission matrix, idempotent logging, windows,
 * entitlement, milestones, observations privacy, timetable announcements, weekly focus versions,
 * parent-only accounts (no fighter), account deletion and the append-only change history.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  fightersTable,
  userRolesTable,
  childrenTable,
  attendanceLogsTable,
  changeHistoryTable,
  guardianLinksTable,
} from "@workspace/db";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";
import { deleteAccountData } from "../lib/accountDeletionService";
import { getUserFighter } from "../middlewares/authMiddleware";

const RUN = Date.now();
const NOW = "2026-11-17T10:00:00Z"; // Tue 17:00 Bangkok; the 16:00 class today has started
let server: Server;
let base = "";

interface U { id: string; email: string; token: string }
const mk = async (label: string, isAdmin = false): Promise<U> => {
  const id = crypto.randomUUID();
  const email = `${label}-${RUN}@example.com`;
  await db.insert(usersTable).values({ id, email, hashedPassword: "x", isAdmin });
  return { id, email, token: await signToken(id, email) };
};

async function call(u: U | null, method: string, path: string, payload?: unknown, now = NOW) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(u ? { authorization: `Bearer ${u.token}` } : {}), "x-test-now": now },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}
const cid = () => crypto.randomUUID();

let frameAdmin: U, gymAdmin: U, coach: U, otherCoach: U, parentA: U, parentB: U, stranger: U, noRole: U, parentC: U, parentE: U;
let gym1 = "", gym2 = "", groupA = "", groupB = "", child1 = "", child2 = "", child3 = "";
const occ: Record<string, string> = {};

async function occurrenceId(gymId: string, groupId: string, date: string): Promise<string> {
  const r = await call(coach, "GET", `/junior/gyms/${gymId}/occurrences?from=${date}&to=${date}&groupId=${groupId}`);
  const o = r.json.occurrences.find((x: any) => x.originalDate === date);
  if (!o) throw new Error(`no occurrence ${date}: ${r.text}`);
  return o.id;
}

beforeAll(async () => {
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
  process.env["JUNIOR_PORTAL_ENABLED"] = "1";
  frameAdmin = await mk("fadmin", true); gymAdmin = await mk("gadmin"); coach = await mk("coach"); otherCoach = await mk("ocoach"); parentA = await mk("pa"); parentB = await mk("pb"); stranger = await mk("stranger"); noRole = await mk("norole"); parentC = await mk("pc"); parentE = await mk("pe");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).log = { warn() {}, error() {}, info() {}, debug() {} }; next(); });
  app.use("/api", apiRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  const g1 = await call(frameAdmin, "POST", "/junior/admin/gyms", { name: "Pilot Gym", slug: `pilot-${RUN}`, adminEmail: gymAdmin.email });
  expect(g1.status).toBe(201);
  gym1 = g1.json.gym.id;
  const g2 = await call(frameAdmin, "POST", "/junior/admin/gyms", { name: "Other Gym", slug: `other-${RUN}`, adminEmail: otherCoach.email });
  gym2 = g2.json.gym.id;
  expect((await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff`, { email: coach.email, role: "coach" })).status).toBe(201);
  groupA = (await call(gymAdmin, "POST", `/junior/gyms/${gym1}/groups`, { name: "Kids A", ageBand: "8-10" })).json.group.id;
  groupB = (await call(gymAdmin, "POST", `/junior/gyms/${gym1}/groups`, { name: "Kids B", ageBand: "11-13" })).json.group.id;
  for (const g of [groupA, groupB]) {
    const s = await call(gymAdmin, "POST", `/junior/gyms/${gym1}/schedules`, { groupId: g, title: "Kids class", weekday: 2, startLocal: "16:00", endLocal: "17:00", effectiveFrom: "2026-10-20" });
    expect(s.status).toBe(201);
  }
  await call(gymAdmin, "PUT", `/junior/gyms/${gym1}/milestone-rules`, { threshold: 2, label: "Two sessions" });

  child1 = (await call(parentA, "POST", "/junior/children", { displayName: "Kid One", birthYearMonth: "2016-05" })).json.child.id;
  const req1 = await call(parentA, "POST", `/junior/children/${child1}/membership-requests`, { gymId: gym1 });
  expect(req1.status).toBe(201);
  const pending = await call(coach, "GET", `/junior/gyms/${gym1}/membership-requests`);
  const m1 = pending.json.requests.find((r: any) => r.childId === child1);
  expect((await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${m1.id}/decide`, { decision: "approve", groupId: groupA })).status).toBe(200);
  expect((await call(frameAdmin, "POST", "/junior/admin/entitlements", { email: parentA.email })).status).toBe(201);
  for (const d of ["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17"]) occ[d] = await occurrenceId(gym1, groupA, d);
  occ["B-1117"] = await occurrenceId(gym1, groupB, "2026-11-17");
});

afterAll(async () => {
  delete process.env["FRAME_ALLOW_TEST_CLOCK"];
  delete process.env["JUNIOR_PORTAL_ENABLED"];
  await new Promise<void>((r) => server.close(() => r()));
});

const log = (u: U, child: string, occurrenceId: string, clientLogId = cid()) =>
  call(u, "POST", `/junior/children/${child}/logs`, { occurrenceId, clientLogId });

describe("pilot flag", () => {
  it("is dark when off, config stays reachable", async () => {
    process.env["JUNIOR_PORTAL_ENABLED"] = "0";
    try {
      expect((await call(parentA, "GET", "/junior/me")).status).toBe(404);
      const c = await call(parentA, "GET", "/junior/config");
      expect(c.status).toBe(200);
      expect(c.json.enabled).toBe(false);
    } finally {
      process.env["JUNIOR_PORTAL_ENABLED"] = "1";
    }
    expect((await call(parentA, "GET", "/junior/me")).status).toBe(200);
  });

  it("requires auth", async () => {
    expect((await call(null, "GET", "/junior/me")).status).toBe(401);
  });
});

describe("permission matrix", () => {
  it("a stranger parent cannot read or write another family's child (404, same as nonexistent)", async () => {
    for (const path of [`/junior/children/${child1}`, `/junior/children/${child1}/journey`, `/junior/children/${child1}/logs`, `/junior/children/${child1}/timetable`, `/junior/children/${child1}/observations`, `/junior/children/${child1}/export`]) {
      expect((await call(stranger, "GET", path)).status, path).toBe(404);
    }
    expect((await log(stranger, child1, occ["2026-11-17"]!)).status).toBe(404);
    const missing = await call(stranger, "GET", `/junior/children/${crypto.randomUUID()}/journey`);
    expect(missing.status).toBe(404);
    expect((await call(stranger, "GET", "/junior/children/not-a-uuid/journey")).status).toBe(404);
  });

  it("choosing the Coach role grants nothing", async () => {
    expect((await call(noRole, "GET", `/junior/gyms/${gym1}/today`)).status).toBe(404);
    const r = await call(noRole, "POST", "/junior/roles", { role: "coach" });
    expect(r.status).toBe(200);
    expect(r.json.note).toMatch(/does not grant/i);
    expect((await call(noRole, "GET", `/junior/gyms/${gym1}/today`)).status).toBe(404);
    expect((await call(noRole, "GET", `/junior/gyms/${gym1}/children`)).status).toBe(404);
    expect((await call(noRole, "POST", `/junior/gyms/${gym1}/groups`, { name: "x" })).status).toBe(404);
    const me = await call(noRole, "GET", "/junior/me");
    expect(me.json.staff).toEqual([]);
  });

  it("a parent cannot use coach routes, and a coach of another gym sees nothing of this gym", async () => {
    expect((await call(parentA, "GET", `/junior/gyms/${gym1}/children`)).status).toBe(404);
    expect((await call(parentA, "POST", `/junior/gyms/${gym1}/children/${child1}/observations`, { visibility: "shared", body: "hi" })).status).toBe(404);
    expect((await call(otherCoach, "GET", `/junior/gyms/${gym1}/today`)).status).toBe(404);
    expect((await call(otherCoach, "GET", `/junior/gyms/${gym1}/children/${child1}`)).status).toBe(404);
    // Own gym, but the child has no approved membership there.
    expect((await call(otherCoach, "GET", `/junior/gyms/${gym2}/children/${child1}`)).status).toBe(404);
    expect((await call(otherCoach, "POST", `/junior/gyms/${gym2}/children/${child1}/observations`, { visibility: "shared", body: "x" })).status).toBe(404);
  });

  it("a coach is not a gym admin", async () => {
    expect((await call(coach, "POST", `/junior/gyms/${gym1}/groups`, { name: "Nope" })).status).toBe(403);
    expect((await call(coach, "GET", `/junior/gyms/${gym1}/history`)).status).toBe(403);
    expect((await call(coach, "POST", "/junior/admin/gyms", { name: "Nope", slug: `nope-${RUN}` })).status).toBe(403);
    expect((await call(parentA, "POST", "/junior/admin/entitlements", { email: parentA.email })).status).toBe(403);
  });

  it("a pending membership gives the parent the child's profile but no gym data", async () => {
    child2 = (await call(parentC, "POST", "/junior/children", { displayName: "Kid Two", birthYearMonth: "2015-02" })).json.child.id;
    await call(parentC, "POST", `/junior/children/${child2}/membership-requests`, { gymId: gym1 });
    expect((await call(parentC, "GET", `/junior/children/${child2}/journey`)).status).toBe(200);
    const t = await call(parentC, "GET", `/junior/children/${child2}/timetable`);
    expect(t.status).toBe(403);
    expect(t.json.code).toBe("MEMBERSHIP_NOT_APPROVED");
    expect((await call(parentC, "GET", `/junior/children/${child2}/observations`)).status).toBe(403);
    // Staff cannot see an unapproved child either.
    expect((await call(coach, "GET", `/junior/gyms/${gym1}/children/${child2}`)).status).toBe(404);
  });

  it("a revoked guardian loses access on the very next request; the last guardian cannot be revoked", async () => {
    const inv = await call(parentA, "POST", `/junior/children/${child1}/guardian-invites`, { email: parentB.email });
    expect(inv.status).toBe(201);
    // Another account cannot use B's invite.
    expect((await call(stranger, "POST", "/junior/guardian-invites/accept", { token: inv.json.inviteToken })).status).toBe(400);
    expect((await call(parentB, "POST", "/junior/guardian-invites/accept", { token: inv.json.inviteToken })).status).toBe(200);
    expect((await call(parentB, "GET", `/junior/children/${child1}/journey`)).status).toBe(200);
    // Single-use.
    expect((await call(parentB, "POST", "/junior/guardian-invites/accept", { token: inv.json.inviteToken })).status).toBe(400);
    expect((await call(parentA, "POST", `/junior/children/${child1}/guardians/${parentA.id}/revoke`)).status).toBe(200);
    expect((await call(parentA, "GET", `/junior/children/${child1}/journey`)).status).toBe(404);
    // Only B is left now.
    expect((await call(parentB, "POST", `/junior/children/${child1}/guardians/${parentB.id}/revoke`)).status).toBe(409);
    // Hand it back so later tests keep working.
    const inv2 = await call(parentB, "POST", `/junior/children/${child1}/guardian-invites`, { email: parentA.email });
    expect((await call(parentA, "POST", "/junior/guardian-invites/accept", { token: inv2.json.inviteToken })).status).toBe(200);
    expect((await call(parentA, "GET", `/junior/children/${child1}/journey`)).status).toBe(200);
  });

  it("revoked staff lose access immediately; the last admin cannot be removed", async () => {
    const extra = await mk("extra-coach");
    expect((await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff`, { email: extra.email, role: "coach" })).status).toBe(201);
    expect((await call(extra, "GET", `/junior/gyms/${gym1}/today`)).status).toBe(200);
    expect((await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff/${extra.id}/revoke`)).status).toBe(200);
    expect((await call(extra, "GET", `/junior/gyms/${gym1}/today`)).status).toBe(404);
    const last = await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff/${gymAdmin.id}/revoke`);
    expect(last.status).toBe(409);
    expect(last.json.code).toBe("LAST_ADMIN");
  });

  it("staff invites work for people who have not signed up yet, once, for the right email", async () => {
    const email = `late-coach-${RUN}@example.com`;
    const inv = await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff`, { email, role: "coach" });
    expect(inv.json.inviteToken).toBeTruthy();
    const late = await mk("latecomer");
    expect((await call(late, "POST", "/junior/staff-invites/accept", { token: inv.json.inviteToken })).status).toBe(400); // different email
    await db.update(usersTable).set({ email }).where(eq(usersTable.id, late.id));
    expect((await call(late, "POST", "/junior/staff-invites/accept", { token: inv.json.inviteToken })).status).toBe(200);
    expect((await call(late, "GET", `/junior/gyms/${gym1}/today`)).status).toBe(200);
    expect((await call(late, "POST", "/junior/staff-invites/accept", { token: inv.json.inviteToken })).status).toBe(400);
  });
});

describe("logging: idempotency, windows and milestones", () => {
  it("replaying the same clientLogId returns the same log, not a second one", async () => {
    const id = cid();
    const a = await log(parentA, child1, occ["2026-10-20"]!, id);
    expect(a.status).toBe(201);
    expect(a.json.milestones.reached).toContain("First session");
    const b = await log(parentA, child1, occ["2026-10-20"]!, id);
    expect(b.status).toBe(200);
    expect(b.json.duplicate).toBe(true);
    expect(b.json.log.id).toBe(a.json.log.id);
    // A different id for the same class is also absorbed (double tap on another device).
    const c = await log(parentA, child1, occ["2026-10-20"]!);
    expect(c.status).toBe(200);
    expect(c.json.log.id).toBe(a.json.log.id);
    const rows = await db.select().from(attendanceLogsTable).where(and(eq(attendanceLogsTable.childId, child1), eq(attendanceLogsTable.status, "active")));
    expect(rows).toHaveLength(1);
  });

  it("a second guardian logging the same class gets the existing log (covered by the other guardian's plan)", async () => {
    // B is covered through A's entitlement (any active guardian is enough).
    const x = await log(parentA, child1, occ["2026-10-27"]!); const y = await log(parentB, child1, occ["2026-10-27"]!);
    expect([x.status, y.status]).toEqual([201, 200]);
    expect(x.json.log.id).toBe(y.json.log.id);
    const rows = await db.select().from(attendanceLogsTable).where(and(eq(attendanceLogsTable.occurrenceId, occ["2026-10-27"]!), eq(attendanceLogsTable.status, "active")));
    expect(rows).toHaveLength(1);
  });

  it("a clientLogId cannot be reused for another child", async () => {
    const id = cid();
    expect((await log(parentA, child1, occ["2026-11-03"]!, id)).status).toBe(201);
    // parentB is also a guardian of child1 only, so the foreign-child case needs a different child.
    const p = await mk("pz");
    const kid = (await call(p, "POST", "/junior/children", { displayName: "Z", birthYearMonth: "2014-01" })).json.child.id;
    await call(frameAdmin, "POST", "/junior/admin/entitlements", { email: p.email });
    const rq = await call(p, "POST", `/junior/children/${kid}/membership-requests`, { gymId: gym1 });
    expect(rq.status).toBe(201);
    const pend = await call(coach, "GET", `/junior/gyms/${gym1}/membership-requests`);
    const mid = pend.json.requests.find((r: any) => r.childId === kid).id;
    await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${mid}/decide`, { decision: "approve", groupId: groupA });
    const clash = await log(p, kid, occ["2026-11-03"]!, id);
    expect(clash.status).toBe(409);
    expect(clash.json.code).toBe("CLIENT_LOG_ID_CONFLICT");
  });

  it("enforces the window: not before the class starts, not past the gym's logging window, not another group's class", async () => {
    const future = await call(gymAdmin, "POST", `/junior/gyms/${gym1}/occurrences`, { groupId: groupA, title: "Future", date: "2026-11-20", startLocal: "16:00", endLocal: "17:00" });
    const f = await log(parentA, child1, future.json.occurrence.id);
    expect(f.status).toBe(422);
    expect(f.json.code).toBe("CLASS_NOT_STARTED");
    const old = await call(gymAdmin, "POST", `/junior/gyms/${gym1}/occurrences`, { groupId: groupA, title: "Old", date: "2026-10-01", startLocal: "16:00", endLocal: "17:00" });
    const o = await log(parentA, child1, old.json.occurrence.id);
    expect(o.status).toBe(422);
    expect(o.json.code).toBe("OUTSIDE_WINDOW");
    // Another group's class looks like it does not exist.
    expect((await log(parentA, child1, occ["B-1117"]!)).status).toBe(404);
    // Widening the window lets the old one in (gym admin setting).
    await db.execute(sql`UPDATE gyms SET logging_window_days = 60 WHERE id = ${gym1}`);
    expect((await log(parentA, child1, old.json.occurrence.id)).status).toBe(201);
    await db.execute(sql`UPDATE gyms SET logging_window_days = 30 WHERE id = ${gym1}`);
  });

  it("milestones follow the active count: reached, withdrawn on undo, re-reached", async () => {
    // child1 now has 4 active logs (10-20, 10-27, 11-03, 10-01).
    const j = await call(parentA, "GET", `/junior/children/${child1}/journey`);
    expect(j.json.sessionCount).toBe(4);
    expect(j.json.milestones.map((m: any) => m.label).sort()).toEqual(["First session", "Two sessions"]);
    const target = j.json.sessions.find((s: any) => s.class.title === "Old");
    // Undo until below 2.
    const all = j.json.sessions as any[];
    let last: any = null;
    for (const s of all.slice(0, 3)) last = await call(parentA, "POST", `/junior/children/${child1}/logs/${s.id}/undo`);
    expect(last.json.milestones.withdrawn).toContain("Two sessions");
    const j2 = await call(parentA, "GET", `/junior/children/${child1}/journey`);
    expect(j2.json.sessionCount).toBe(1);
    expect(j2.json.milestones.map((m: any) => m.label)).toEqual(["First session"]);
    // Undo is idempotent.
    expect((await call(parentA, "POST", `/junior/children/${child1}/logs/${all[0].id}/undo`)).json.alreadyUndone).toBe(true);
    // Log again: the milestone is re-reached.
    const again = await log(parentA, child1, occ["2026-10-27"]!);
    expect(again.status).toBe(201);
    expect(again.json.milestones.reached).toContain("Two sessions");
    expect(target).toBeTruthy();
  });

  it("a coach can remove a log with a reason; history records it", async () => {
    const lg = await log(parentA, child1, occ["2026-11-10"]!);
    expect(lg.status).toBe(201);
    expect((await call(coach, "POST", `/junior/gyms/${gym1}/logs/${lg.json.log.id}/remove`, {})).status).toBe(400);
    expect((await call(coach, "POST", `/junior/gyms/${gym1}/logs/${lg.json.log.id}/remove`, { reason: "Was absent" })).status).toBe(200);
    expect((await call(otherCoach, "POST", `/junior/gyms/${gym2}/logs/${lg.json.log.id}/remove`, { reason: "Was absent" })).status).toBe(404);
    const [h] = await db.select().from(changeHistoryTable).where(and(eq(changeHistoryTable.entity, "attendance_log"), eq(changeHistoryTable.entityId, lg.json.log.id), eq(changeHistoryTable.action, "removed")));
    expect(h?.reason).toBe("Was absent");
  });
});

describe("entitlement (pilot grant)", () => {
  it("gates writes only; reads, undo and membership are unaffected; a staff member is never gated", async () => {
    parentE = parentE ?? (await mk("pe"));
    child3 = (await call(parentE, "POST", "/junior/children", { displayName: "Kid Three", birthYearMonth: "2013-09" })).json.child.id;
    await call(parentE, "POST", `/junior/children/${child3}/membership-requests`, { gymId: gym1 });
    const pend = await call(coach, "GET", `/junior/gyms/${gym1}/membership-requests`);
    const mid = pend.json.requests.find((r: any) => r.childId === child3).id;
    await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${mid}/decide`, { decision: "approve", groupId: groupA });

    const blocked = await log(parentE, child3, occ["2026-11-17"]!);
    expect(blocked.status).toBe(402);
    expect(blocked.json.code).toBe("PARENT_PLAN_REQUIRED");
    expect((await call(parentE, "PUT", `/junior/children/${child3}/wellbeing`, { mood: 2 })).status).toBe(402);
    // Reads and gym membership still work.
    expect((await call(parentE, "GET", `/junior/children/${child3}/journey`)).status).toBe(200);
    expect((await call(parentE, "GET", `/junior/children/${child3}/timetable`)).status).toBe(200);
    // Coach writes need no parent plan.
    expect((await call(coach, "POST", `/junior/gyms/${gym1}/children/${child3}/observations`, { visibility: "shared", body: "Great focus today" })).status).toBe(201);

    // Grant -> works. Expire -> blocked again, but membership/history untouched and undo still allowed.
    await call(frameAdmin, "POST", "/junior/admin/entitlements", { email: parentE.email });
    const ok = await log(parentE, child3, occ["2026-11-17"]!);
    expect(ok.status).toBe(201);
    await call(frameAdmin, "DELETE", `/junior/admin/entitlements/${parentE.id}`);
    expect((await log(parentE, child3, occ["2026-11-10"]!)).status).toBe(402);
    const jr = await call(parentE, "GET", `/junior/children/${child3}/journey`);
    expect(jr.json.sessionCount).toBe(1);
    expect(jr.json.canAddRecords).toBe(false);
    expect((await call(parentE, "POST", `/junior/children/${child3}/logs/${ok.json.log.id}/undo`)).status).toBe(200);
    // An expired grant counts as no grant.
    await call(frameAdmin, "POST", "/junior/admin/entitlements", { email: parentE.email, expiresAt: "2026-01-01T00:00:00Z" });
    expect((await log(parentE, child3, occ["2026-11-10"]!)).status).toBe(402);
    const me = await call(parentE, "GET", "/junior/me");
    expect(me.json.children[0].membership.status).toBe("approved");
  });
});

describe("observations: shared vs private", () => {
  it("parents never receive private notes, anywhere", async () => {
    const shared = await call(coach, "POST", `/junior/gyms/${gym1}/children/${child1}/observations`, { visibility: "shared", body: "SHARED-NOTE good guard work" });
    const priv = await call(coach, "POST", `/junior/gyms/${gym1}/children/${child1}/observations`, { visibility: "private", body: "PRIVATE-NOTE talk to dad about attendance" });
    expect(shared.status).toBe(201);
    expect(priv.status).toBe(201);
    for (const path of [`/junior/children/${child1}/observations`, `/junior/children/${child1}/journey`, `/junior/children/${child1}/export`]) {
      const r = await call(parentA, "GET", path);
      expect(r.status).toBe(200);
      expect(r.text, path).toContain("SHARED-NOTE");
      expect(r.text, path).not.toContain("PRIVATE-NOTE");
    }
    const prof = await call(coach, "GET", `/junior/gyms/${gym1}/children/${child1}`);
    expect(prof.text).toContain("SHARED-NOTE");
    expect(prof.text).toContain("PRIVATE-NOTE");
    // Coach profile never carries wellbeing or guardian emails.
    expect(prof.text).not.toContain(parentA.email);
    // Withdrawing a shared note removes it from the parent view; only author or admin may.
    expect((await call(gymAdmin, "POST", `/junior/gyms/${gym1}/observations/${shared.json.observation.id}/withdraw`)).status).toBe(200);
    expect((await call(parentA, "GET", `/junior/children/${child1}/observations`)).text).not.toContain("SHARED-NOTE");
    const other = await mk("coach2");
    await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff`, { email: other.email, role: "coach" });
    expect((await call(other, "POST", `/junior/gyms/${gym1}/observations/${priv.json.observation.id}/withdraw`)).status).toBe(403);
  });

  it("wellbeing stays with the family and is not in any coach response", async () => {
    expect((await call(parentA, "PUT", `/junior/children/${child1}/wellbeing`, { mood: 3, energy: 2, sleep: 1, note: "WELLBEING-SECRET" })).status).toBe(200);
    expect((await call(parentA, "PUT", `/junior/children/${child1}/wellbeing`, { mood: 9 })).status).toBe(400);
    for (const path of [`/junior/gyms/${gym1}/children/${child1}`, `/junior/gyms/${gym1}/occurrences/${occ["2026-11-17"]}/roster`, `/junior/gyms/${gym1}/today`, `/junior/gyms/${gym1}/history`]) {
      const r = await call(path.endsWith("history") ? gymAdmin : coach, "GET", path);
      expect(r.text, path).not.toContain("WELLBEING-SECRET");
    }
    const got = await call(parentA, "GET", `/junior/children/${child1}/wellbeing`);
    expect(got.json.entries).toHaveLength(1);
  });
});

describe("timetable changes", () => {
  it("cancelling a class announces to that group only; a class with logs needs confirmation and withdraws them", async () => {
    // child1 has a log on groupA's 11-10 class? No (removed). Use 10-27 which has an active log.
    const hasLogs = await call(coach, "PATCH", `/junior/gyms/${gym1}/occurrences/${occ["2026-10-27"]}`, { cancel: true });
    expect(hasLogs.status).toBe(409);
    expect(hasLogs.json.code).toBe("HAS_LOGS");
    expect(hasLogs.json.logCount).toBe(1);
    const before = (await call(parentA, "GET", `/junior/children/${child1}/journey`)).json.sessionCount;
    const done = await call(coach, "PATCH", `/junior/gyms/${gym1}/occurrences/${occ["2026-10-27"]}`, { cancel: true, confirm: true });
    expect(done.status).toBe(200);
    expect(done.json.removedLogs).toBe(1);
    expect((await call(parentA, "GET", `/junior/children/${child1}/journey`)).json.sessionCount).toBe(before - 1);
    const ann = await call(parentA, "GET", `/junior/children/${child1}/announcements`);
    expect(ann.json.announcements.some((a: any) => a.kind === "timetable" && /Cancelled/.test(a.title))).toBe(true);

    // Cancelling group B's class does not show up for group A's child.
    await call(coach, "PATCH", `/junior/gyms/${gym1}/occurrences/${occ["B-1117"]}`, { cancel: true });
    const ann2 = await call(parentA, "GET", `/junior/children/${child1}/announcements`);
    expect(ann2.json.announcements.every((a: any) => a.groupId === groupA || a.groupId === null)).toBe(true);
    // Cancelled classes cannot be logged.
    const lg = await log(parentA, child1, occ["2026-10-27"]!);
    expect(lg.status).toBe(422);
    expect(lg.json.code).toBe("CLASS_CANCELLED");
    // Mark-as-read works for the family and not for an outsider.
    const first = ann2.json.announcements[0];
    expect((await call(stranger, "POST", `/junior/announcements/${first.id}/read`)).status).toBe(404);
    expect((await call(parentA, "POST", `/junior/announcements/${first.id}/read`)).status).toBe(200);
    expect((await call(parentA, "GET", `/junior/children/${child1}/announcements`)).json.announcements.find((a: any) => a.id === first.id).read).toBe(true);
  });

  it("editing a class moves it and announces; it cannot move into the future once logged", async () => {
    const e = await call(coach, "PATCH", `/junior/gyms/${gym1}/occurrences/${occ["2026-11-03"]}`, { startLocal: "17:00", endLocal: "18:00" });
    expect(e.status).toBe(200);
    const one = await call(gymAdmin, "POST", `/junior/gyms/${gym1}/occurrences`, { groupId: groupA, title: "Extra", date: "2026-11-12", startLocal: "16:00", endLocal: "17:00" });
    expect((await log(parentA, child1, one.json.occurrence.id)).status).toBe(201);
    const fut = await call(coach, "PATCH", `/junior/gyms/${gym1}/occurrences/${one.json.occurrence.id}`, { date: "2026-12-01" });
    expect(fut.status).toBe(422);
  });
});

describe("weekly focus", () => {
  it("is versioned; a log keeps the version that was current; later weeks carry forward", async () => {
    const put1 = await call(coach, "PUT", `/junior/gyms/${gym1}/groups/${groupA}/focus`, { title: "Guard retention", practiceDetails: "Frames and hip escape" });
    expect(put1.json.version).toBe(1);
    const lg = await log(parentA, child1, occ["2026-11-10"]!);
    expect(lg.status).toBe(201);
    const put2 = await call(coach, "PUT", `/junior/gyms/${gym1}/groups/${groupA}/focus`, { title: "Guard retention v2", practiceDetails: "More" });
    expect(put2.json.version).toBe(2);
    const cur = await call(coach, "GET", `/junior/gyms/${gym1}/groups/${groupA}/focus`);
    expect(cur.json.focus.title).toBe("Guard retention v2");
    const nextWeek = await call(coach, "GET", `/junior/gyms/${gym1}/groups/${groupA}/focus?weekStart=2026-11-23`);
    expect(nextWeek.json.focus.title).toBe("Guard retention v2");
    expect(nextWeek.json.focus.carriedFrom).toBe("2026-11-16");
    // The 11-10 class belongs to the previous week (no focus there): no focus recorded on that log.
    expect(lg.json.log.focusVersionId).toBeNull();
    // A log in the focus week records the (earliest-known) version, and later edits do not change it.
    const wk = await log(parentA, child1, occ["2026-11-17"]!);
    expect(wk.status).toBe(201);
    expect(wk.json.log.focusVersionId).toBeTruthy();
    const jr = await call(parentA, "GET", `/junior/children/${child1}/journey`);
    const s = jr.json.sessions.find((x: any) => x.id === wk.json.log.id);
    expect(s.focus.title).toBe("Guard retention");
    expect((await call(parentA, "GET", `/junior/children/${child1}/timetable`)).json.focus.title).toBe("Guard retention v2");
  });
});

describe("parent-only accounts", () => {
  it("sign up without AI consent, get no fighter, and are never auto-created one", async () => {
    const email = `parent-only-${RUN}@example.com`;
    const r = await call(null, "POST", "/auth/register", { email, password: "longenough1", acceptedTerms: true, acceptedPrivacy: true, role: "parent", name: "P" });
    expect(r.status).toBe(201);
    const uid = r.json.userId as string;
    const tok = { id: uid, email, token: r.json.token } as U;
    expect((await call(tok, "GET", "/junior/me")).status).toBe(200);
    expect((await call(tok, "GET", "/fighter")).status).not.toBe(200);
    const roles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, uid));
    expect(roles.map((x) => x.role)).toEqual(["parent"]);
    const fake = { userId: uid, log: { warn() {} } } as any;
    expect(await getUserFighter(fake)).toBeNull();
    expect(await db.select().from(fightersTable).where(eq(fightersTable.userId, uid))).toHaveLength(0);
  });

  it("the old sign-up contract is unchanged: AI consent still required, athletes get their stub", async () => {
    const email = `athlete-${RUN}@example.com`;
    const noConsent = await call(null, "POST", "/auth/register", { email, password: "longenough1", acceptedTerms: true, acceptedPrivacy: true });
    expect(noConsent.status).toBe(400);
    expect(noConsent.json.code).toBe("AI_CONSENT_REQUIRED");
    // role=parent without the flag also falls back to the old contract.
    process.env["JUNIOR_PORTAL_ENABLED"] = "0";
    try {
      const flagOff = await call(null, "POST", "/auth/register", { email, password: "longenough1", acceptedTerms: true, acceptedPrivacy: true, role: "parent" });
      expect(flagOff.status).toBe(400);
    } finally {
      process.env["JUNIOR_PORTAL_ENABLED"] = "1";
    }
  });

  it("an account with no role rows (every existing athlete) still gets its fighter stub", async () => {
    const legacy = await mk("legacy-athlete");
    const fighter = await getUserFighter({ userId: legacy.id, log: { warn() {} } } as any);
    expect(fighter?.userId).toBe(legacy.id);
    // Using the junior surface as an athlete does not change that.
    expect((await call(legacy, "GET", "/junior/me")).json.roles).toEqual([]);
  });
});

describe("account deletion and change history", () => {
  it("deleting a sole guardian removes the child and its history; a shared child survives", async () => {
    const p = await mk("deleter");
    const kid = (await call(p, "POST", "/junior/children", { displayName: "Doomed", birthYearMonth: "2014-03" })).json.child.id;
    await call(p, "POST", `/junior/children/${kid}/membership-requests`, { gymId: gym1 });
    const mid = (await call(coach, "GET", `/junior/gyms/${gym1}/membership-requests`)).json.requests.find((r: any) => r.childId === kid).id;
    await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${mid}/decide`, { decision: "approve", groupId: groupA });
    await call(coach, "POST", `/junior/gyms/${gym1}/children/${kid}/observations`, { visibility: "private", body: "to be purged" });
    expect((await db.select().from(changeHistoryTable).where(eq(changeHistoryTable.childId, kid))).length).toBeGreaterThan(0);

    await deleteAccountData(p.id);
    expect(await db.select().from(childrenTable).where(eq(childrenTable.id, kid))).toHaveLength(0);
    expect(await db.select().from(changeHistoryTable).where(eq(changeHistoryTable.childId, kid))).toHaveLength(0);
    const marker = await db.select().from(changeHistoryTable).where(and(eq(changeHistoryTable.gymId, gym1), eq(changeHistoryTable.entity, "child"), eq(changeHistoryTable.action, "deleted")));
    expect(marker.length).toBeGreaterThan(0);

    // child1 has two guardians: deleting parentB leaves it alone.
    await deleteAccountData(parentB.id);
    expect(await db.select().from(childrenTable).where(eq(childrenTable.id, child1))).toHaveLength(1);
    const links = await db.select().from(guardianLinksTable).where(and(eq(guardianLinksTable.childId, child1), eq(guardianLinksTable.status, "active")));
    expect(links.map((l) => l.userId)).toEqual([parentA.id]);
  });

  it("change_history rejects UPDATE and DELETE outside the purge path", async () => {
    const [row] = await db.select().from(changeHistoryTable).limit(1);
    await expect(db.execute(sql`UPDATE change_history SET action = 'x' WHERE id = ${row!.id}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM change_history WHERE id = ${row!.id}`)).rejects.toThrow();
    const hist = await call(gymAdmin, "GET", `/junior/gyms/${gym1}/history`);
    expect(hist.status).toBe(200);
    expect(hist.json.history.length).toBeGreaterThan(5);
    expect((await call(parentA, "GET", `/junior/gyms/${gym1}/history`)).status).toBe(404);
  });

  it("a parent can hard-delete a child they guard; a non-guardian cannot", async () => {
    const p = await mk("deleter2");
    const kid = (await call(p, "POST", "/junior/children", { displayName: "Tmp", birthYearMonth: "2012-12" })).json.child.id;
    expect((await call(stranger, "DELETE", `/junior/children/${kid}`)).status).toBe(404);
    expect((await call(p, "DELETE", `/junior/children/${kid}`)).status).toBe(200);
    expect(await db.select({ id: childrenTable.id }).from(childrenTable).where(inArray(childrenTable.id, [kid]))).toHaveLength(0);
  });
});
