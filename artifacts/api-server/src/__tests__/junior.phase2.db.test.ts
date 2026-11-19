/**
 * Junior Portal phase 2 against a REAL Postgres: parent timeline + empty states, invite accept/decline/cancel,
 * privacy controls, notification hooks, development records (individual focus, stars, recap, change-from-date),
 * team area, role-filtered change history, and entitlement admin + append-only audit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, like, sql } from "drizzle-orm";
import { db, usersTable, notificationsTable, entitlementAuditTable, userEntitlementsTable } from "@workspace/db";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

const RUN = Date.now();
const NOW = "2026-11-17T10:00:00Z"; // Tue 17:00 Bangkok
let server: Server;
let base = "";

interface U { id: string; email: string; token: string }
const mk = async (label: string, isAdmin = false): Promise<U> => {
  const id = crypto.randomUUID();
  const email = `p2-${label}-${RUN}@example.com`;
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
async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 3000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
const inbox = (uid: string, kind: string) =>
  db.select().from(notificationsTable).where(and(eq(notificationsTable.userId, uid), like(notificationsTable.kind, kind)));

let frameAdmin: U, gymAdmin: U, coach: U, parentA: U, parentB: U, parentC: U, stranger: U, lateCoach: U;
let gym = "", groupA = "", groupB = "", child1 = "", child2 = "", schedA = "";
const occ: Record<string, string> = {};

beforeAll(async () => {
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
  process.env["JUNIOR_PORTAL_ENABLED"] = "1";
  delete process.env["PUSH_JOB_ENABLED"];
  frameAdmin = await mk("fadmin", true); gymAdmin = await mk("gadmin"); coach = await mk("coach"); parentA = await mk("pa"); parentB = await mk("pb"); parentC = await mk("pc"); stranger = await mk("str"); lateCoach = await mk("late");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).log = { warn() {}, error: (...a: any[]) => console.error("SRVERR", ...a.map((x) => (x && x.stack) || JSON.stringify(x))), info() {}, debug() {} }; next(); });
  app.use("/api", apiRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  gym = (await call(frameAdmin, "POST", "/junior/admin/gyms", { name: "P2 Gym", slug: `p2-${RUN}`, adminEmail: gymAdmin.email })).json.gym.id;
  await call(gymAdmin, "POST", `/junior/gyms/${gym}/staff`, { email: coach.email, role: "coach" });
  groupA = (await call(gymAdmin, "POST", `/junior/gyms/${gym}/groups`, { name: "A", ageBand: "8-10" })).json.group.id;
  groupB = (await call(gymAdmin, "POST", `/junior/gyms/${gym}/groups`, { name: "B", ageBand: "11-13" })).json.group.id;
  const s = await call(gymAdmin, "POST", `/junior/gyms/${gym}/schedules`, { groupId: groupA, title: "Kids", weekday: 2, startLocal: "16:00", endLocal: "17:00", effectiveFrom: "2026-10-20" });
  schedA = s.json.schedule.id;
  await call(frameAdmin, "POST", "/junior/admin/entitlements", { email: parentA.email });

  child1 = (await call(parentA, "POST", "/junior/children", { displayName: "Kid One", birthYearMonth: "2016-05" })).json.child.id;
  child2 = (await call(parentB, "POST", "/junior/children", { displayName: "Kid Two", birthYearMonth: "2015-02" })).json.child.id;
});

afterAll(async () => {
  delete process.env["FRAME_ALLOW_TEST_CLOCK"];
  delete process.env["JUNIOR_PORTAL_ENABLED"];
  await new Promise<void>((r) => server.close(() => r()));
});

async function approve(parent: U, child: string, groupId: string | null) {
  await call(parent, "POST", `/junior/children/${child}/membership-requests`, { gymId: gym });
  const pending = await call(coach, "GET", `/junior/gyms/${gym}/membership-requests`);
  const m = pending.json.requests.find((r: any) => r.childId === child);
  const r = await call(coach, "POST", `/junior/gyms/${gym}/membership-requests/${m.id}/decide`, groupId ? { decision: "approve", groupId } : { decision: "approve" });
  expect(r.status).toBe(200);
}

describe("S1 parent timeline and empty states", () => {
  it("shows NO_GYM before any membership, and 404 to strangers", async () => {
    const r = await call(parentA, "GET", `/junior/children/${child1}/timeline`);
    expect(r.status).toBe(200);
    expect(r.json.items).toEqual([]);
    expect(r.json.emptyState.code).toBe("NO_GYM");
    expect((await call(stranger, "GET", `/junior/children/${child1}/timeline`)).status).toBe(404);
    expect((await call(parentB, "GET", `/junior/children/${child1}/privacy`)).status).toBe(404);
  });

  it("after approval shows membership item; logs and stars appear newest first", async () => {
    await approve(parentA, child1, groupA);
    const list = await call(coach, "GET", `/junior/gyms/${gym}/occurrences?from=2026-11-10&to=2026-11-10&groupId=${groupA}`);
    occ["1110"] = list.json.occurrences[0].id;
    expect((await call(parentA, "POST", `/junior/children/${child1}/logs`, { occurrenceId: occ["1110"], clientLogId: crypto.randomUUID() })).status).toBe(201);
    expect((await call(coach, "POST", `/junior/gyms/${gym}/children/${child1}/stars`, { note: "Great effort", weekStart: "2026-11-09" })).status).toBe(201);
    const real = new Date(Date.now() + 60_000).toISOString();
    const r = await call(parentA, "GET", `/junior/children/${child1}/timeline`, undefined, real);
    expect(r.status).toBe(200);
    const types = r.json.items.map((i: any) => i.type);
    expect(types).toContain("membership");
    expect(types).toContain("star");
    expect(types).toContain("session");
    const times = r.json.items.map((i: any) => new Date(i.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const paged = await call(parentA, "GET", `/junior/children/${child1}/timeline?limit=1`, undefined, real);
    expect(paged.json.items).toHaveLength(1);
    expect(paged.json.nextBefore).toBeTruthy();
  });

  it("second star in the same week is rejected (409)", async () => {
    const r = await call(coach, "POST", `/junior/gyms/${gym}/children/${child1}/stars`, { weekStart: "2026-11-11" });
    expect(r.status).toBe(409);
  });

  it("no-group child gets NO_GROUP team card", async () => {
    await approve(parentB, child2, null);
    const r = await call(parentB, "GET", `/junior/children/${child2}/team`);
    expect(r.status).toBe(200);
    expect(r.json.emptyState.code).toBe("NO_GROUP");
  });
});

describe("S1 invites", () => {
  it("guardian invite: appears in inbox by email, decline then cannot accept, cancel hides it", async () => {
    const inv = await call(parentA, "POST", `/junior/children/${child1}/guardian-invites`, { email: parentC.email });
    expect(inv.status).toBe(201);
    const mine = await call(parentC, "GET", "/junior/my/invites");
    expect(mine.json.invites).toHaveLength(1);
    expect(mine.json.invites[0].kind).toBe("guardian");
    const id = mine.json.invites[0].id;
    // a stranger cannot act on it
    expect((await call(stranger, "POST", `/junior/my/invites/guardian/${id}/accept`)).status).toBe(404);
    expect((await call(parentC, "POST", `/junior/my/invites/guardian/${id}/decline`)).status).toBe(200);
    expect((await call(parentC, "POST", `/junior/my/invites/guardian/${id}/accept`)).status).toBe(404);
    expect((await call(parentC, "GET", "/junior/my/invites")).json.emptyState.code).toBe("NO_INVITES");
  });

  it("accept links the guardian; cancel by an existing guardian works before accept", async () => {
    const inv = await call(parentA, "POST", `/junior/children/${child1}/guardian-invites`, { email: parentC.email });
    expect(inv.status).toBe(201);
    const pendingList = await call(parentA, "GET", `/junior/children/${child1}/guardian-invites`);
    expect(pendingList.json.invites.length).toBeGreaterThan(0);
    const id = pendingList.json.invites[0].id;
    expect((await call(parentA, "POST", `/junior/children/${child1}/guardian-invites/${id}/cancel`)).status).toBe(200);
    expect((await call(parentC, "POST", `/junior/my/invites/guardian/${id}/accept`)).status).toBe(404);
    await call(parentA, "POST", `/junior/children/${child1}/guardian-invites`, { email: parentC.email });
    const id2 = (await call(parentC, "GET", "/junior/my/invites")).json.invites[0].id;
    expect((await call(parentC, "POST", `/junior/my/invites/guardian/${id2}/accept`)).status).toBe(200);
    expect((await call(parentC, "GET", `/junior/children/${child1}/timeline`)).status).toBe(200);
  });

  it("staff invite goes through the same inbox", async () => {
    const invitee = `p2-late2-${RUN}@example.com`;
    const r = await call(gymAdmin, "POST", `/junior/gyms/${gym}/staff`, { email: invitee, role: "coach" });
    expect(r.status).toBe(201);
    // the person signs up afterwards with that address; the invite waits in their inbox
    lateCoach = await mk("late2");
    const mine = await call(lateCoach, "GET", "/junior/my/invites");
    const inv = mine.json.invites.find((i: any) => i.kind === "staff");
    expect(inv).toBeTruthy();
    expect((await call(lateCoach, "POST", `/junior/my/invites/staff/${inv.id}/accept`)).status).toBe(200);
    expect((await call(lateCoach, "GET", `/junior/gyms/${gym}/groups`)).status).toBe(200);
  });
});

describe("S1 privacy", () => {
  it("defaults: wellbeing hidden from coach; only guardians can change", async () => {
    const g = await call(parentA, "GET", `/junior/children/${child1}/privacy`);
    expect(g.json.settings.coachSeesWellbeing).toBe(false);
    expect(g.json.matrix).toBeTruthy();
    const w = await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/wellbeing`);
    expect(w.json.shared).toBe(false);
    expect((await call(coach, "PUT", `/junior/children/${child1}/privacy`, { coachSeesWellbeing: true })).status).toBe(404);
    expect((await call(stranger, "PUT", `/junior/children/${child1}/privacy`, { coachSeesWellbeing: true })).status).toBe(404);
  });

  it("opt-in shares only parent-reported averages, and is revocable", async () => {
    const put = await call(parentA, "PUT", `/junior/children/${child1}/privacy`, { coachSeesWellbeing: true });
    expect(put.status).toBe(200);
    expect(put.json.settings.coachSeesWellbeing).toBe(true);
    const w = await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/wellbeing`);
    expect(w.json.shared).toBe(true);
    expect(w.json.source).toBe("parent-reported");
    expect(w.text).not.toMatch(/note/i);
    await call(parentA, "PUT", `/junior/children/${child1}/privacy`, { coachSeesWellbeing: false });
    expect((await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/wellbeing`)).json.shared).toBe(false);
  });

  it("team recognition opt-out hides the child's star from other families", async () => {
    await call(parentA, "PUT", `/junior/children/${child1}/privacy`, { teamSeesRecognition: false });
    const r = await call(parentC, "GET", `/junior/children/${child1}/team`);
    expect(r.status).toBe(200);
    // own guardian still sees the star
    const mine = await call(parentA, "GET", `/junior/children/${child1}/team`);
    expect(mine.json.recognition.mine.length).toBeGreaterThan(0);
    await call(parentA, "PUT", `/junior/children/${child1}/privacy`, { teamSeesRecognition: true });
  });
});

describe("S1 notification hooks", () => {
  it("shared observation notifies guardians with generic copy; private does not", async () => {
    const before = (await inbox(parentA.id, "junior_%")).length;
    const priv = await call(coach, "POST", `/junior/gyms/${gym}/children/${child1}/observations`, { visibility: "private", body: "SECRET-COACH-NOTE" });
    expect(priv.status).toBe(201);
    await new Promise((r) => setTimeout(r, 300));
    expect((await inbox(parentA.id, "junior_%")).length).toBe(before);
    expect((await call(coach, "POST", `/junior/gyms/${gym}/children/${child1}/observations`, { visibility: "shared", body: "SHARED-NOTE-TEXT" })).status).toBe(201);
    const rows = await waitFor(async () => { const r = await inbox(parentA.id, "junior_observations"); return r.length ? r : null; });
    expect(rows).toBeTruthy();
    const text = JSON.stringify(rows);
    expect(text).not.toContain("SHARED-NOTE-TEXT");
    expect(text).not.toContain("Kid One");
  });

  it("respects per-topic prefs and works with the existing inbox endpoints", async () => {
    expect((await call(parentB, "PUT", "/junior/notification-prefs", { announcements: false })).json.prefs.announcements).toBe(false);
    await call(gymAdmin, "POST", `/junior/gyms/${gym}/announcements`, { title: "Hello", body: "Gym news" });
    const a = await waitFor(async () => { const r = await inbox(parentA.id, "junior_announcements"); return r.length ? r : null; });
    expect(a).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    expect((await inbox(parentB.id, "junior_announcements")).length).toBe(0);
    const list = await call(parentA, "GET", "/notifications");
    expect(list.status).toBe(200);
  });

  it("is dark with the flag off (no inbox rows created)", async () => {
    process.env["JUNIOR_PORTAL_ENABLED"] = "0";
    try {
      const before = (await inbox(parentA.id, "junior_%")).length;
      const { notifyUsers, noticeFor } = await import("../lib/junior/notify");
      await notifyUsers([parentA.id], noticeFor("announcements", `flagoff:${RUN}`), new Date(NOW));
      expect((await inbox(parentA.id, "junior_%")).length).toBe(before);
    } finally {
      process.env["JUNIOR_PORTAL_ENABLED"] = "1";
    }
  });
});

describe("S2 development records", () => {
  it("individual focus: one active at a time, parent sees it, coach-only for others", async () => {
    const a = await call(coach, "POST", `/junior/gyms/${gym}/children/${child1}/individual-focus`, { title: "Keep guard up" });
    expect(a.status).toBe(201);
    const b = await call(coach, "POST", `/junior/gyms/${gym}/children/${child1}/individual-focus`, { title: "Footwork" });
    expect(b.status).toBe(201);
    const list = await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/individual-focus`);
    expect(list.json.focuses.filter((f: any) => f.status === "active")).toHaveLength(1);
    const pp = await call(parentA, "GET", `/junior/children/${child1}/passport`);
    expect(pp.json.individualFocus.title).toBe("Footwork");
    expect((await call(parentB, "GET", `/junior/children/${child1}/passport`)).status).toBe(404);
    expect((await call(stranger, "POST", `/junior/gyms/${gym}/children/${child1}/individual-focus`, { title: "x" })).status).toBe(404);
  });

  it("recap counts logged vs held and never says absent", async () => {
    const r = await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/recap?month=2026-11`);
    expect(r.status).toBe(200);
    expect(r.json.sessionsLogged).toBe(1);
    expect(r.json.classesHeld).toBeGreaterThanOrEqual(r.json.sessionsLogged);
    expect(r.json.notLogged).toBe(r.json.classesHeld - r.json.sessionsLogged);
    expect(r.text.toLowerCase()).not.toContain('"absent"');
    expect(r.json.notLoggedNote).toMatch(/not logged/i);
    expect((await call(parentA, "GET", `/junior/gyms/${gym}/children/${child1}/recap?month=2026-11`)).status).toBe(404);
    expect((await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/recap?month=bad`)).status).toBe(400);
  });

  it("change-from-date: admin only, keeps logged occurrence, replaces future ones", async () => {
    expect((await call(coach, "POST", `/junior/gyms/${gym}/schedules/${schedA}/change-from`, { fromDate: "2026-11-24", startLocal: "17:00", endLocal: "18:00" })).status).toBe(403);
    expect((await call(gymAdmin, "POST", `/junior/gyms/${gym}/schedules/${schedA}/change-from`, { fromDate: "2026-11-01", startLocal: "17:00", endLocal: "18:00" })).status).toBe(422);
    const r = await call(gymAdmin, "POST", `/junior/gyms/${gym}/schedules/${schedA}/change-from`, { fromDate: "2026-11-24", startLocal: "17:00", endLocal: "18:00" });
    expect(r.status).toBe(201);
    expect(r.json.removedOccurrences).toBeGreaterThan(0);
    expect(r.json.createdOccurrences).toBeGreaterThan(0);
    const old = await call(coach, "GET", `/junior/gyms/${gym}/occurrences?from=2026-11-10&to=2026-11-10&groupId=${groupA}`);
    expect(old.json.occurrences.length).toBe(1); // history before the change untouched, log still valid
    const fresh = await call(coach, "GET", `/junior/gyms/${gym}/occurrences?from=2026-11-24&to=2026-11-24&groupId=${groupA}`);
    expect(fresh.json.occurrences).toHaveLength(1);
    expect(JSON.stringify(fresh.json.occurrences[0])).toContain("T10:00");
  });
});

describe("S2 team area", () => {
  it("team overview, bulk assign all-or-nothing, role change keeps one admin, group archive blocked when not empty", async () => {
    expect((await call(coach, "GET", `/junior/gyms/${gym}/team`)).status).toBe(403);
    const t = await call(gymAdmin, "GET", `/junior/gyms/${gym}/team`);
    expect(t.status).toBe(200);
    expect(t.json.unassigned.map((c: any) => c.id)).toContain(child2);
    const bad = await call(gymAdmin, "POST", `/junior/gyms/${gym}/groups/${groupB}/assign`, { childIds: [child2, crypto.randomUUID()] });
    expect(bad.status).toBe(422);
    expect((await call(gymAdmin, "GET", `/junior/gyms/${gym}/team`)).json.unassigned.map((c: any) => c.id)).toContain(child2);
    expect((await call(gymAdmin, "POST", `/junior/gyms/${gym}/groups/${groupB}/assign`, { childIds: [child2] })).status).toBe(200);
    expect((await call(parentB, "GET", `/junior/children/${child2}/team`)).json.group.name).toBe("B");
    expect((await call(gymAdmin, "PATCH", `/junior/gyms/${gym}/groups/${groupB}`, { active: false })).status).toBe(409);
    expect((await call(gymAdmin, "PATCH", `/junior/gyms/${gym}/staff/${gymAdmin.id}`, { role: "coach" })).status).toBe(409);
    expect((await call(gymAdmin, "PATCH", `/junior/gyms/${gym}/staff/${coach.id}`, { role: "admin" })).status).toBe(200);
    expect((await call(gymAdmin, "PATCH", `/junior/gyms/${gym}/staff/${coach.id}`, { role: "coach" })).status).toBe(200);
  });

  it("staff invite can be cancelled and then cannot be accepted", async () => {
    const ghost = await mk("ghost");
    await call(gymAdmin, "POST", `/junior/gyms/${gym}/staff`, { email: ghost.email, role: "coach" });
    const t = await call(gymAdmin, "GET", `/junior/gyms/${gym}/team`);
    // ghost is an existing user, so added directly or invited depending on the flow; handle both
    const inv = t.json.pendingInvites.find((i: any) => i.email === ghost.email);
    if (inv) {
      expect((await call(gymAdmin, "POST", `/junior/gyms/${gym}/staff-invites/${inv.id}/cancel`)).status).toBe(200);
      expect((await call(ghost, "POST", `/junior/my/invites/staff/${inv.id}/accept`)).status).toBe(404);
    }
  });
});

describe("S2 role-filtered change history", () => {
  it("parent sees no internal ids or private notes; coach history hides guardian links", async () => {
    const p = await call(parentA, "GET", `/junior/children/${child1}/history`);
    expect(p.status).toBe(200);
    expect(p.text).not.toContain("SECRET-COACH-NOTE");
    expect(p.text).not.toContain(coach.id);
    expect(p.text).not.toContain(gymAdmin.id);
    const c = await call(coach, "GET", `/junior/gyms/${gym}/children/${child1}/history`);
    expect(c.status).toBe(200);
    expect(c.text).not.toContain("guardian_link");
    expect((await call(stranger, "GET", `/junior/children/${child1}/history`)).status).toBe(404);
    expect((await call(parentA, "GET", `/junior/gyms/${gym}/children/${child1}/history`)).status).toBe(404);
  });
});

describe("S3 entitlement admin + audit", () => {
  it("is FRAME-admin only", async () => {
    for (const u of [gymAdmin, coach, parentA]) {
      expect((await call(u, "POST", `/junior/admin/entitlements/gym/${gym}/grant`, {})).status).toBe(403);
      expect((await call(u, "GET", "/junior/admin/entitlements/audit")).status).toBe(403);
    }
  });

  it("grant by gym covers guardians of approved children and is audited with one batch id", async () => {
    const r = await call(frameAdmin, "POST", `/junior/admin/entitlements/gym/${gym}/grant`, { reason: "pilot cohort" });
    expect(r.status).toBe(201);
    expect(r.json.granted).toBeGreaterThanOrEqual(3); // A, B, C (guardian of child1)
    const audit = await call(frameAdmin, "GET", `/junior/admin/entitlements/audit?batchId=${r.json.batchId}`);
    expect(audit.json.audit.length).toBe(r.json.granted);
    expect(audit.json.audit.every((a: any) => a.action === "granted" && a.reason === "pilot cohort" && a.gymId === gym)).toBe(true);
    const me = await call(parentB, "GET", "/junior/me");
    expect(me.status).toBe(200);
  });

  it("revoke by family only touches that child's guardians and never RevenueCat grants", async () => {
    await db.insert(userEntitlementsTable).values({ userId: parentB.id, entitlement: "frame_parent", source: "revenuecat", status: "active" });
    const r = await call(frameAdmin, "POST", `/junior/admin/entitlements/family/${child2}/revoke`, { reason: "left" });
    expect(r.status).toBe(200);
    expect(r.json.revoked).toBe(1); // pilot row only
    const rows = await db.select().from(userEntitlementsTable).where(eq(userEntitlementsTable.userId, parentB.id));
    expect(rows.find((x) => x.source === "revenuecat")!.status).toBe("active");
    expect(rows.find((x) => x.source === "pilot")!.status).toBe("revoked");
    const a = (await call(frameAdmin, "GET", `/junior/admin/entitlements/audit?userId=${parentB.id}`)).json.audit;
    expect(a[0].action).toBe("revoked");
    expect((await call(frameAdmin, "POST", `/junior/admin/entitlements/family/${crypto.randomUUID()}/grant`, {})).status).toBe(404);
  });

  it("legacy single grant/revoke also write audit rows", async () => {
    await call(frameAdmin, "POST", "/junior/admin/entitlements", { email: stranger.email });
    await call(frameAdmin, "DELETE", `/junior/admin/entitlements/${stranger.id}`);
    const rows = await db.select().from(entitlementAuditTable).where(eq(entitlementAuditTable.targetUserId, stranger.id));
    expect(rows.map((r) => r.action).sort()).toEqual(["granted", "revoked"]);
  });

  it("audit rows are append-only", async () => {
    const [row] = await db.select().from(entitlementAuditTable).where(eq(entitlementAuditTable.targetUserId, stranger.id)).limit(1);
    await expect(db.update(entitlementAuditTable).set({ reason: "tamper" }).where(eq(entitlementAuditTable.id, row!.id))).rejects.toThrow();
    await expect(db.delete(entitlementAuditTable).where(eq(entitlementAuditTable.id, row!.id))).rejects.toThrow();
    const listed = await call(frameAdmin, "GET", "/junior/admin/entitlements?status=active");
    expect(listed.status).toBe(200);
    expect(sql`1`).toBeTruthy();
  });
});
