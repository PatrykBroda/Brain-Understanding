/**
 * Junior accounts, "Join a gym", and gym performance boards against a REAL Postgres:
 * gym search (public fields only, rate limit), join request lifecycle (adult + parent-for-junior),
 * junior creation / consent / parent link / fenced login / pause / delete / export,
 * parent visibility limits, leaderboard authorization, privacy opt-in, most-improved calculation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  fightersTable,
  userRolesTable,
  childrenTable,
  gymsTable,
  attendanceLogsTable,
  classOccurrencesTable,
  juniorAccountsTable,
  juniorConsentsTable,
  observationsTable,
  wellbeingEntriesTable,
} from "@workspace/db";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";
import { _searchStore, _joinStore } from "../routes/junior/join";
import { _createStore, _redeemStore } from "../routes/junior/accounts";
import { JUNIOR_CONSENT_VERSION, ageBandFor, ageOn } from "../lib/junior/accountConfig";
import { boardName, mostImproved, periodWindow, rankByMinutes, streakWeeks, summarize } from "../lib/junior/stats";

const RUN = Date.now();
const NOW = "2026-11-17T10:00:00Z";
const NOW_D = new Date(NOW);
const DAY = 86400000;
let server: Server;
let base = "";

interface U { id: string; email: string; token: string }
const mk = async (label: string, isAdmin = false): Promise<U> => {
  const id = crypto.randomUUID();
  const email = `${label}-${RUN}@example.com`;
  await db.insert(usersTable).values({ id, email, hashedPassword: "x", isAdmin });
  return { id, email, token: await signToken(id, email) };
};
async function call(u: U | { token: string } | null, method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(u ? { authorization: `Bearer ${u.token}` } : {}), "x-test-now": NOW },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}

const CONSENT = { accepted: true, version: JUNIOR_CONSENT_VERSION };
let frameAdmin: U, gymAdmin: U, coach: U, otherAdmin: U, pa: U, pb: U, pc: U, adult: U, adult2: U, stranger: U;
let gym1 = "", gym2 = "", group1 = "";

beforeAll(async () => {
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
  process.env["JUNIOR_PORTAL_ENABLED"] = "1";
  frameAdmin = await mk("ja-fadmin", true); gymAdmin = await mk("ja-gadmin"); coach = await mk("ja-coach"); otherAdmin = await mk("ja-oadmin");
  pa = await mk("ja-pa"); pb = await mk("ja-pb"); pc = await mk("ja-pc"); adult = await mk("ja-adult"); adult2 = await mk("ja-adult2"); stranger = await mk("ja-stranger");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).log = { warn() {}, error() {}, info() {}, debug() {} }; next(); });
  app.use("/api", apiRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  gym1 = (await call(frameAdmin, "POST", "/junior/admin/gyms", { name: `Alpha Boxing ${RUN}`, slug: `alpha-${RUN}`, adminEmail: gymAdmin.email })).json.gym.id;
  gym2 = (await call(frameAdmin, "POST", "/junior/admin/gyms", { name: `Beta MMA ${RUN}`, slug: `beta-${RUN}`, adminEmail: otherAdmin.email })).json.gym.id;
  await db.update(gymsTable).set({ location: "Phuket" }).where(eq(gymsTable.id, gym1));
  await db.update(gymsTable).set({ location: "Bangkok" }).where(eq(gymsTable.id, gym2));
  expect((await call(gymAdmin, "POST", `/junior/gyms/${gym1}/staff`, { email: coach.email, role: "coach" })).status).toBe(201);
  group1 = (await call(gymAdmin, "POST", `/junior/gyms/${gym1}/groups`, { name: "Kids", ageBand: "8-12" })).json.group.id;
});
afterAll(async () => {
  delete process.env["JUNIOR_PORTAL_ENABLED"];
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => { _searchStore.clear(); _joinStore.clear(); _createStore.clear(); _redeemStore.clear(); });

// ── pure helpers ─────────────────────────────────────────────────────────────
describe("stats helpers", () => {
  it("boardName: first name + initial only", () => {
    expect(boardName("Mia Kowalski")).toBe("Mia K.");
    expect(boardName("  mia   de la cruz ")).toBe("mia C.");
    expect(boardName("Mia")).toBe("Mia");
    expect(boardName("")).toBe("Member");
  });
  it("age and band", () => {
    expect(ageOn("2012-11-18", NOW_D)).toBe(13);
    expect(ageOn("2012-11-17", NOW_D)).toBe(14);
    expect(ageBandFor(12)).toBe("under_13");
    expect(ageBandFor(13)).toBe("13_15");
    expect(ageBandFor(16)).toBe("16_17");
  });
  it("periodWindow: rolling window and equal prior window", () => {
    const w = periodWindow("week", NOW_D);
    expect(w.end.getTime() - w.start.getTime()).toBe(7 * DAY);
    expect(w.priorEnd.getTime()).toBe(w.start.getTime());
    expect(w.priorEnd.getTime() - w.priorStart.getTime()).toBe(7 * DAY);
    expect(periodWindow("term", NOW_D).start.getTime()).toBe(NOW_D.getTime() - 84 * DAY);
  });
  it("streak counts consecutive weeks and tolerates an empty current week", () => {
    const at = (d: number) => ({ at: new Date(NOW_D.getTime() - d * DAY), minutes: 60 });
    expect(streakWeeks([at(1), at(3), at(9)], NOW_D)).toBe(3);
    expect(streakWeeks([at(3), at(9)], NOW_D)).toBe(2); // nothing yet this week: still counts from last week
    expect(streakWeeks([at(1), at(16)], NOW_D)).toBe(1); // gap breaks it
    expect(streakWeeks([], NOW_D)).toBe(0);
  });
  it("mostImproved: biggest positive delta, needs current activity, ties by sessions then name", () => {
    const rows = [
      { key: "a", name: "Ann", minutes: 180, sessions: 3, priorMinutes: 60 }, // +120
      { key: "b", name: "Bo", minutes: 120, sessions: 2, priorMinutes: 0 }, // +120, fewer sessions
      { key: "c", name: "Cy", minutes: 60, sessions: 1, priorMinutes: 120 }, // negative
      { key: "d", name: "Di", minutes: 0, sessions: 0, priorMinutes: 0 }, // inactive
      { key: "e", name: "Ed", minutes: 90, sessions: 2, priorMinutes: 60 }, // +30
    ];
    const out = mostImproved(rows);
    expect(out.map((r) => r.key)).toEqual(["a", "b", "e"]);
    expect(out[0]).toMatchObject({ delta: 120, pct: 200 });
    expect(out[1]!.pct).toBeNull(); // no prior activity: no percentage
  });
  it("rankByMinutes: shared rank on ties, next rank skips", () => {
    const m = rankByMinutes([
      { key: "a", minutes: 100, sessions: 2, priorMinutes: 0 },
      { key: "b", minutes: 100, sessions: 2, priorMinutes: 0 },
      { key: "c", minutes: 50, sessions: 1, priorMinutes: 0 },
    ]);
    expect([m.get("a"), m.get("b"), m.get("c")]).toEqual([1, 1, 3]);
  });
  it("summarize splits current and prior windows", () => {
    const at = (d: number, minutes = 60) => ({ at: new Date(NOW_D.getTime() - d * DAY), minutes });
    const m = summarize([at(1), at(3, 30), at(9)], periodWindow("week", NOW_D), NOW_D);
    expect(m).toMatchObject({ sessions: 2, minutes: 90, priorSessions: 1, priorMinutes: 60 });
  });
});

// ── B. gym search ────────────────────────────────────────────────────────────
describe("gym search", () => {
  it("requires a login", async () => {
    expect((await call(null, "GET", "/junior/gym-search?q=alpha")).status).toBe(401);
  });
  it("returns only id, name and city; matches name or city, case-insensitive", async () => {
    const r = await call(adult, "GET", `/junior/gym-search?q=alpha boxing ${RUN}`);
    expect(r.status).toBe(200);
    expect(r.json.gyms).toHaveLength(1);
    expect(Object.keys(r.json.gyms[0]).sort()).toEqual(["city", "id", "name"]);
    expect(r.json.gyms[0]).toMatchObject({ id: gym1, city: "Phuket" });
    const byCity = await call(adult, "GET", "/junior/gym-search?q=BANGKOK");
    expect(byCity.json.gyms.map((g: any) => g.id)).toContain(gym2);
    expect(r.text).not.toMatch(/slug|timezone|email|staff|member/i);
  });
  it("hides inactive gyms and treats % as a literal", async () => {
    const [g] = await db.insert(gymsTable).values({ name: `Closed Gym ${RUN}`, slug: `closed-${RUN}`, location: "Nowhere", status: "inactive" }).returning();
    expect((await call(adult, "GET", `/junior/gym-search?q=Closed Gym ${RUN}`)).json.gyms).toHaveLength(0);
    expect(g).toBeTruthy();
    expect((await call(adult, "GET", "/junior/gym-search?q=%25")).json.gyms).toHaveLength(0);
  });
  it("rate-limits", async () => {
    let last = 0;
    for (let i = 0; i < 45; i++) last = (await call(stranger, "GET", "/junior/gym-search?q=a")).status;
    expect(last).toBe(429);
  });
});

// ── B. join request lifecycle ────────────────────────────────────────────────
describe("join a gym", () => {
  it("adult: request -> pending, duplicate is idempotent, shows in my list", async () => {
    const r = await call(adult, "POST", "/junior/gym-join-requests", { gymId: gym1 });
    expect(r.status).toBe(201);
    expect(r.json.request).toMatchObject({ kind: "member", status: "pending", gymId: gym1 });
    const dup = await call(adult, "POST", "/junior/gym-join-requests", { gymId: gym1 });
    expect(dup.status).toBe(200);
    expect(dup.json.alreadyOpen).toBe(true);
    const mine = await call(adult, "GET", "/junior/gym-join-requests");
    expect(mine.json.requests).toHaveLength(1);
    expect(mine.json.requests[0]).toMatchObject({ status: "pending", kind: "member", gymName: `Alpha Boxing ${RUN}`, city: "Phuket" });
  });
  it("staff see it (name only), strangers and other gyms' staff cannot", async () => {
    const ok = await call(coach, "GET", `/junior/gyms/${gym1}/membership-requests`);
    expect(ok.status).toBe(200);
    expect(ok.json.requests.some((x: any) => x.kind === "member")).toBe(true);
    expect(ok.text).not.toContain(adult.email);
    expect((await call(otherAdmin, "GET", `/junior/gyms/${gym1}/membership-requests`)).status).toBe(404);
    expect((await call(stranger, "GET", `/junior/gyms/${gym1}/membership-requests`)).status).toBe(404);
  });
  it("cancel while pending, then request again, then decline -> shown as declined", async () => {
    const id = (await call(adult, "GET", "/junior/gym-join-requests")).json.requests[0].id;
    expect((await call(stranger, "POST", `/junior/gym-join-requests/${id}/cancel`)).status).toBe(404);
    expect((await call(adult, "POST", `/junior/gym-join-requests/${id}/cancel`)).status).toBe(200);
    expect((await call(adult, "POST", `/junior/gym-join-requests/${id}/cancel`)).status).toBe(409);
    expect((await call(adult, "GET", "/junior/gym-join-requests")).json.requests[0].status).toBe("cancelled");
    const again = await call(adult, "POST", "/junior/gym-join-requests", { gymId: gym1 });
    expect(again.status).toBe(201);
    expect((await call(otherAdmin, "POST", `/junior/gyms/${gym1}/membership-requests/${again.json.request.id}/decide`, { decision: "reject" })).status).toBe(404);
    expect((await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${again.json.request.id}/decide`, { decision: "reject" })).status).toBe(200);
    expect((await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${again.json.request.id}/decide`, { decision: "approve" })).status).toBe(409);
    const list = (await call(adult, "GET", "/junior/gym-join-requests")).json.requests;
    expect(list.find((x: any) => x.id === again.json.request.id).status).toBe("declined");
  });
  it("approve -> approved; cannot cancel an approved one; can leave", async () => {
    const r = await call(adult2, "POST", "/junior/gym-join-requests", { gymId: gym1 });
    const id = r.json.request.id;
    expect((await call(gymAdmin, "POST", `/junior/gyms/${gym1}/membership-requests/${id}/decide`, { decision: "approve" })).status).toBe(200);
    expect((await call(adult2, "GET", "/junior/gym-join-requests")).json.requests[0].status).toBe("approved");
    expect((await call(adult2, "POST", `/junior/gym-join-requests/${id}/cancel`)).status).toBe(409);
    expect((await call(adult2, "PUT", `/junior/gym-memberships/${id}/board`, { showOnBoard: true })).status).toBe(200);
    expect((await call(adult2, "POST", `/junior/gym-join-requests/${id}/leave`)).status).toBe(200);
  });
  it("staff cannot request to join their own gym; unknown gym is 404; junior-less parent request for a stranger's child is 404", async () => {
    expect((await call(coach, "POST", "/junior/gym-join-requests", { gymId: gym1 })).status).toBe(409);
    expect((await call(adult, "POST", "/junior/gym-join-requests", { gymId: crypto.randomUUID() })).status).toBe(404);
    const kid = (await call(pa, "POST", "/junior/children", { displayName: "Req Kid", birthYearMonth: "2015-04" })).json.child.id;
    expect((await call(pb, "POST", "/junior/gym-join-requests", { gymId: gym1, childId: kid })).status).toBe(404);
  });
  it("parent requests for their junior; status is visible to the parent only; cancel works", async () => {
    const kid = (await call(pa, "POST", "/junior/children", { displayName: "Join Kid", birthYearMonth: "2015-04" })).json.child.id;
    const r = await call(pa, "POST", "/junior/gym-join-requests", { gymId: gym2, childId: kid });
    expect(r.status).toBe(201);
    expect(r.json.request.kind).toBe("junior");
    const mine = (await call(pa, "GET", "/junior/gym-join-requests")).json.requests.find((x: any) => x.childId === kid);
    expect(mine).toMatchObject({ status: "pending", childName: "Join Kid" });
    expect((await call(pb, "GET", "/junior/gym-join-requests")).json.requests.find((x: any) => x.childId === kid)).toBeUndefined();
    expect((await call(pb, "POST", `/junior/gym-join-requests/${mine.id}/cancel`)).status).toBe(404);
    expect((await call(otherAdmin, "GET", `/junior/gyms/${gym2}/membership-requests`)).json.requests.some((x: any) => x.kind === "junior")).toBe(true);
    expect((await call(pa, "POST", `/junior/gym-join-requests/${mine.id}/cancel`)).status).toBe(200);
  });
});

// ── C. junior accounts ───────────────────────────────────────────────────────
const bday = (years: number) => `${2026 - years}-03-15`;
describe("junior accounts: creation, consent, link", () => {
  let kid = "";
  const uname = `mia_${RUN}`.slice(0, 20);
  it("rules endpoint returns config; consent is required and versioned", async () => {
    const rules = await call(pa, "GET", "/junior/junior-accounts/rules");
    expect(rules.json).toMatchObject({ minAge: expect.any(Number), loginMinAge: 13, aiChatAvailable: false, consentVersion: JUNIOR_CONSENT_VERSION });
    const noConsent = await call(pa, "POST", "/junior/junior-accounts", { displayName: "X", birthDate: bday(14), consent: { accepted: true, version: "old" } });
    expect(noConsent.status).toBe(400);
    expect(noConsent.json.code).toBe("CONSENT_REQUIRED");
    expect((await call(pa, "POST", "/junior/junior-accounts", { displayName: "X", birthDate: bday(14) })).status).toBe(400);
  });
  it("age rules: too young, adult, future date, login under the login age", async () => {
    expect((await call(pa, "POST", "/junior/junior-accounts", { displayName: "Tiny", birthDate: bday(3), consent: CONSENT })).json.code).toBe("AGE_BELOW_MINIMUM");
    expect((await call(pa, "POST", "/junior/junior-accounts", { displayName: "Grown", birthDate: bday(19), consent: CONSENT })).json.code).toBe("AGE_ABOVE_MAXIMUM");
    expect((await call(pa, "POST", "/junior/junior-accounts", { displayName: "Future", birthDate: "2030-01-01", consent: CONSENT })).json.code).toBe("INVALID_BIRTH_DATE");
    const u = await call(pa, "POST", "/junior/junior-accounts", { displayName: "Ten", birthDate: bday(10), consent: CONSENT, login: { mode: "password", username: `ten_${RUN}`.slice(0, 20), password: "Passw0rd!demo1" } });
    expect(u.status).toBe(422);
    expect(u.json.code).toBe("LOGIN_NOT_ALLOWED_AT_AGE");
  });
  it("under the login age: parent-managed account, no login, child record + guardian link + consent", async () => {
    const r = await call(pa, "POST", "/junior/junior-accounts", { displayName: "Little Lou", birthDate: bday(9), consent: CONSENT });
    expect(r.status).toBe(201);
    expect(r.json.junior).toMatchObject({ status: "parent_managed", hasLogin: false, ageBand: "under_13", aiEnabled: false });
    const [ja] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, r.json.child.id));
    expect(ja!.userId).toBeNull();
    expect((await call(pa, "GET", `/junior/children/${r.json.child.id}`)).status).toBe(200); // linked via guardian_links
    expect((await call(pb, "GET", `/junior/children/${r.json.child.id}`)).status).toBe(404);
  });
  it("with a password login: users row is_junior, no fighter / roles / AI consent, consent recorded, linked to parent", async () => {
    const r = await call(pa, "POST", "/junior/junior-accounts", { displayName: "Mia Kowalski", birthDate: bday(14), consent: CONSENT, login: { mode: "password", username: uname, password: "Passw0rd!demo1" } });
    expect(r.status).toBe(201);
    kid = r.json.child.id;
    expect(r.json.junior).toMatchObject({ status: "active", hasLogin: true, username: uname, ageBand: "13_15" });
    expect(r.text).not.toMatch(/hashedPassword|passwordHash/);
    const [ja] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, kid));
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, ja!.userId!));
    expect(u).toMatchObject({ isJunior: true, aiAnalysisConsentVersion: null });
    expect(await db.select().from(fightersTable).where(eq(fightersTable.userId, u!.id))).toHaveLength(0);
    expect(await db.select().from(userRolesTable).where(eq(userRolesTable.userId, u!.id))).toHaveLength(0);
    const [c] = await db.select().from(juniorConsentsTable).where(eq(juniorConsentsTable.childId, kid));
    expect(c).toMatchObject({ guardianUserId: pa.id, version: JUNIOR_CONSENT_VERSION, ageBand: "13_15", withdrawnAt: null });
    expect(c!.consentedAt).toBeInstanceOf(Date);
    expect((await call(pa, "GET", "/junior/junior-accounts")).json.juniors.map((j: any) => j.childId)).toContain(kid);
    expect((await call(pb, "GET", "/junior/junior-accounts")).json.juniors.map((j: any) => j.childId)).not.toContain(kid);
  });
  it("username rules: taken, invalid, weak password; reserved login domain cannot register", async () => {
    const dup = await call(pb, "POST", "/junior/junior-accounts", { displayName: "Dup", birthDate: bday(14), consent: CONSENT, login: { mode: "password", username: uname, password: "Passw0rd!demo1" } });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("USERNAME_TAKEN");
    expect((await call(pb, "POST", "/junior/junior-accounts", { displayName: "Dup", birthDate: bday(14), consent: CONSENT, login: { mode: "password", username: "A B", password: "Passw0rd!demo1" } })).json.code).toBe("INVALID_USERNAME");
    expect((await call(pb, "POST", "/junior/junior-accounts", { displayName: "Dup", birthDate: bday(14), consent: CONSENT, login: { mode: "password", username: `weak_${RUN}`.slice(0, 20), password: "x" } })).json.code).toBe("INVALID_PASSWORD");
    const reg = await fetch(base + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "sneaky@junior.frame.invalid", password: "Passw0rd!demo1", acceptedTerms: true, acceptedPrivacy: true, role: "parent" }) });
    expect(reg.status).toBe(400);
  });
  it("a failed creation leaves nothing behind (no orphan child)", async () => {
    const before = (await db.select().from(childrenTable).where(eq(childrenTable.displayName, "Orphan Test"))).length;
    await call(pb, "POST", "/junior/junior-accounts", { displayName: "Orphan Test", birthDate: bday(14), consent: CONSENT, login: { mode: "password", username: uname, password: "Passw0rd!demo1" } });
    expect((await db.select().from(childrenTable).where(eq(childrenTable.displayName, "Orphan Test"))).length).toBe(before);
  });
  it("junior signs in with the username; wrong password fails", async () => {
    const ok = await call(null, "POST", "/auth/login", { email: uname, password: "Passw0rd!demo1" });
    expect(ok.status).toBe(200);
    expect(ok.json.token).toBeTruthy();
    expect((await call(null, "POST", "/auth/login", { email: uname, password: "nope-nope-nope" })).status).toBe(401);
  });
  it("invite flow: code finishes setup once; expired / used / bad codes fail", async () => {
    const r = await call(pa, "POST", "/junior/junior-accounts", { displayName: "Invited Ivy", birthDate: bday(15), consent: CONSENT, login: { mode: "invite" } });
    expect(r.status).toBe(201);
    expect(r.json.junior.status).toBe("pending_setup");
    const code = r.json.inviteCode;
    expect(code).toBeTruthy();
    const un = `ivy_${RUN}`.slice(0, 20);
    expect((await call(null, "POST", "/junior/junior-setup/redeem", { code: "x".repeat(30), username: un, password: "Passw0rd!demo1" })).json.code).toBe("INVALID_CODE");
    // the redeem route is unauthenticated and uses real time: give the code a real-time expiry
    await db.update(juniorAccountsTable).set({ inviteExpiresAt: new Date(Date.now() + 3600_000) }).where(eq(juniorAccountsTable.childId, r.json.child.id));
    const done = await call(null, "POST", "/junior/junior-setup/redeem", { code, username: un, password: "Passw0rd!demo1" });
    expect(done.status, done.text).toBe(201);
    expect((await call({ token: done.json.token }, "GET", "/junior/junior-me")).status).toBe(200);
    expect((await call(null, "POST", "/junior/junior-setup/redeem", { code, username: `${un}2`, password: "Passw0rd!demo1" })).json.code).toBe("INVALID_CODE");
    const r2 = await call(pa, "POST", "/junior/junior-accounts", { displayName: "Late Lee", birthDate: bday(15), consent: CONSENT, login: { mode: "invite" } });
    await db.update(juniorAccountsTable).set({ inviteExpiresAt: new Date(Date.now() - 1000) }).where(eq(juniorAccountsTable.childId, r2.json.child.id));
    expect((await call(null, "POST", "/junior/junior-setup/redeem", { code: r2.json.inviteCode, username: `${un}3`, password: "Passw0rd!demo1" })).json.code).toBe("INVALID_CODE");
  });

  describe("fenced login, pause, AI flag, export, delete", () => {
    let jt: { token: string };
    beforeAll(async () => {
      jt = { token: (await call(null, "POST", "/auth/login", { email: uname, password: "Passw0rd!demo1" })).json.token };
    });
    it("junior can reach only its own view", async () => {
      const me = await call(jt, "GET", "/junior/junior-me");
      expect(me.status).toBe(200);
      expect(me.json.junior).toEqual({ firstName: "Mia", ageBand: "13_15" });
      expect(me.json.aiCoach.available).toBe(false);
      expect(me.text).not.toMatch(/Kowalski|parent|@/i);
    });
    it("junior cannot search gyms, request to join, touch guardian endpoints, message, use the AI coach or delete itself", async () => {
      const blocked = [
        ["GET", "/junior/gym-search?q=a"],
        ["POST", "/junior/gym-join-requests"],
        ["GET", "/junior/children"],
        ["POST", "/junior/guardian-invites/accept"],
        ["POST", `/junior/children/${kid}/guardians/${pa.id}/revoke`],
        ["POST", "/junior/roles"],
        ["GET", "/conversation"],
        ["POST", "/coach/chat"],
        ["DELETE", "/account"],
        ["GET", "/fighter"],
      ] as const;
      for (const [m, p] of blocked) {
        const r = await call(jt, m, p, m === "POST" ? {} : undefined);
        expect(r.status, `${m} ${p}`).toBe(403);
        expect(r.json.code).toBe("JUNIOR_ACCOUNT_RESTRICTED");
      }
    });
    it("AI/chat stays off: parent cannot enable it while the flag is off", async () => {
      const r = await call(pa, "PUT", `/junior/junior-accounts/${kid}/ai`, { enabled: true });
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("AI_NOT_AVAILABLE");
      const [ja] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, kid));
      expect(ja).toMatchObject({ aiEnabled: false, chatEnabled: false });
    });
    it("only the parent can pause; a paused junior is blocked even with a valid token and cannot sign in", async () => {
      expect((await call(pb, "POST", `/junior/junior-accounts/${kid}/pause`, { paused: true })).status).toBe(404);
      expect((await call(pa, "POST", `/junior/junior-accounts/${kid}/pause`, { paused: true })).status).toBe(200);
      const r = await call(jt, "GET", "/junior/junior-me");
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("JUNIOR_ACCOUNT_PAUSED");
      const login = await call(null, "POST", "/auth/login", { email: uname, password: "Passw0rd!demo1" });
      expect(login.status).toBe(403);
      expect(login.json.code).toBe("JUNIOR_ACCOUNT_PAUSED");
      expect((await call(pa, "POST", `/junior/junior-accounts/${kid}/pause`, { paused: false })).status).toBe(200);
      expect((await call(jt, "GET", "/junior/junior-me")).status).toBe(200);
    });
    it("parent resets the password; old password stops working", async () => {
      expect((await call(pb, "POST", `/junior/junior-accounts/${kid}/reset-password`, { password: "Another-pass-9" })).status).toBe(404);
      expect((await call(pa, "POST", `/junior/junior-accounts/${kid}/reset-password`, { password: "Another-pass-9" })).status).toBe(200);
      expect((await call(null, "POST", "/auth/login", { email: uname, password: "Passw0rd!demo1" })).status).toBe(401);
      expect((await call(null, "POST", "/auth/login", { email: uname, password: "Another-pass-9" })).status).toBe(200);
    });
    it("export holds the consent record and no password hash; only the parent can export", async () => {
      expect((await call(pb, "GET", `/junior/junior-accounts/${kid}/export`)).status).toBe(404);
      const r = await call(pa, "GET", `/junior/junior-accounts/${kid}/export`);
      expect(r.status).toBe(200);
      expect(r.json.consents[0]).toMatchObject({ guardianUserId: pa.id, version: JUNIOR_CONSENT_VERSION });
      expect(r.json.account.birthDate).toBe(bday(14));
      expect(r.text).not.toMatch(/hashed|\$2[aby]\$/);
    });
    it("delete: only the parent; removes login, record and consent", async () => {
      const k2 = await call(pa, "POST", "/junior/junior-accounts", { displayName: "Delete Dee", birthDate: bday(14), consent: CONSENT, login: { mode: "password", username: `dee_${RUN}`.slice(0, 20), password: "Passw0rd!demo1" } });
      const id = k2.json.child.id;
      const [ja] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.childId, id));
      expect((await call(pb, "DELETE", `/junior/junior-accounts/${id}`)).status).toBe(404);
      expect((await call(pa, "DELETE", `/junior/junior-accounts/${id}`)).status).toBe(200);
      expect(await db.select().from(usersTable).where(eq(usersTable.id, ja!.userId!))).toHaveLength(0);
      expect(await db.select().from(childrenTable).where(eq(childrenTable.id, id))).toHaveLength(0);
      expect(await db.select().from(juniorConsentsTable).where(eq(juniorConsentsTable.childId, id))).toHaveLength(0);
      expect((await call(null, "POST", "/auth/login", { email: `dee_${RUN}`.slice(0, 20), password: "Passw0rd!demo1" })).status).toBe(401);
    });
  });
});

// ── gym performance ──────────────────────────────────────────────────────────
describe("gym performance: summary, boards, privacy, authorization", () => {
  let mia = "", noah = "", leo = "", pendingKid = "", gym2Kid = "";
  const mkKid = async (parent: U, name: string) =>
    (await call(parent, "POST", "/junior/junior-accounts", { displayName: name, birthDate: bday(11), consent: CONSENT })).json.child.id as string;
  const occ: Record<number, string> = {};
  const logAt = async (childId: string, d: number) => {
    await db.insert(attendanceLogsTable).values({ childId, occurrenceId: occ[d]!, clientLogId: `seed-${childId}-${d}-${RUN}`, source: "parent" });
  };

  beforeAll(async () => {
    mia = await mkKid(pa, "Mia Kowalski");
    noah = await mkKid(pb, "Noah Berg");
    leo = await mkKid(pc, "Leo Park");
    pendingKid = await mkKid(pa, "Pending Pat");
    gym2Kid = await mkKid(pb, "Elsewhere Eli");
    for (const [k, parent] of [[mia, pa], [noah, pb], [leo, pc]] as const) {
      const r = await call(parent, "POST", "/junior/gym-join-requests", { gymId: gym1, childId: k });
      expect((await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${r.json.request.id}/decide`, { decision: "approve", groupId: group1 })).status).toBe(200);
    }
    await call(pa, "POST", "/junior/gym-join-requests", { gymId: gym1, childId: pendingKid }); // stays pending
    const r2 = await call(pb, "POST", "/junior/gym-join-requests", { gymId: gym2, childId: gym2Kid });
    await call(otherAdmin, "POST", `/junior/gyms/${gym2}/membership-requests/${r2.json.request.id}/decide`, { decision: "approve" });
    // one class an hour long on each of the last 6 days (current week window) and 8..13 days ago (prior window)
    for (const d of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]) {
      const startsAt = new Date(NOW_D.getTime() - d * DAY);
      const [o] = await db.insert(classOccurrencesTable).values({ gymId: gym1, groupId: group1, originalDate: startsAt.toISOString().slice(0, 10), startsAt, endsAt: new Date(startsAt.getTime() + 3600_000), title: "Kids class" }).returning();
      occ[d] = o!.id;
    }
    for (const d of [1, 3, 5, 9]) await logAt(mia, d); // 3 now (180 min), 1 before (60)
    for (const d of [2, 4]) await logAt(noah, d); // 2 now (120), 0 before
    for (const d of [6, 8, 10]) await logAt(leo, d); // 1 now (60), 2 before (120)
    await logAt(pendingKid, 1); // not approved: must never count
    // a gym2 class + log for Eli: must never reach gym1's board
    const startsAt = new Date(NOW_D.getTime() - DAY);
    const [o2] = await db.insert(classOccurrencesTable).values({ gymId: gym2, groupId: group1, originalDate: startsAt.toISOString().slice(0, 10), startsAt, endsAt: new Date(startsAt.getTime() + 3600_000), title: "Other gym" }).returning();
    await db.insert(attendanceLogsTable).values({ childId: gym2Kid, occurrenceId: o2!.id, clientLogId: `seed-eli-${RUN}`, source: "parent" });
  });

  it("parent junior summary: sessions, minutes, streak, last active; shared coach notes only; no private note, no mood", async () => {
    await db.insert(observationsTable).values([
      { childId: mia, gymId: gym1, authorId: coach.id, visibility: "shared", body: "Great footwork today" },
      { childId: mia, gymId: gym1, authorId: coach.id, visibility: "private", body: "PRIVATE: talks about home" },
    ]);
    await db.insert(wellbeingEntriesTable).values({ childId: mia, localDate: "2026-11-16", mood: 1, note: "SECRET MOOD NOTE" });
    const r = await call(pa, "GET", `/junior/junior-accounts/${mia}/summary?period=week`);
    expect(r.status).toBe(200);
    expect(r.json.summary).toMatchObject({ sessions: 3, trainingMinutes: 180, streakWeeks: 3 });
    expect(new Date(r.json.summary.lastActiveAt).getTime()).toBe(NOW_D.getTime() - DAY);
    expect(r.json.sharedCoachNotes.map((n: any) => n.body)).toEqual(["Great footwork today"]);
    expect(r.text).not.toMatch(/PRIVATE|SECRET MOOD/);
    expect((await call(pa, "GET", `/junior/junior-accounts/${mia}/summary?period=month`)).json.summary.sessions).toBe(4);
  });
  it("another parent, a coach and a stranger cannot read a junior's summary", async () => {
    expect((await call(pb, "GET", `/junior/junior-accounts/${mia}/summary`)).status).toBe(404);
    expect((await call(coach, "GET", `/junior/junior-accounts/${mia}/summary`)).status).toBe(404);
    expect((await call(stranger, "GET", `/junior/junior-accounts/${mia}/summary`)).status).toBe(404);
  });

  it("leaderboard: non-staff and other gyms' staff get 403 and no data", async () => {
    for (const u of [stranger, pa, adult, otherAdmin]) {
      const r = await call(u, "GET", `/junior/gyms/${gym1}/leaderboard`);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("NOT_GYM_STAFF");
      expect(r.text).not.toMatch(/Mia|Noah|Leo/);
    }
    expect((await call(null, "GET", `/junior/gyms/${gym1}/leaderboard`)).status).toBe(401);
    expect((await call(coach, "GET", `/junior/gyms/${gym2}/leaderboard`)).status).toBe(403);
  });
  it("an approved MEMBER of another gym (or of this gym) is still not staff: 403", async () => {
    const r = await call(adult2, "POST", "/junior/gym-join-requests", { gymId: gym2 });
    await call(otherAdmin, "POST", `/junior/gyms/${gym2}/membership-requests/${r.json.request.id}/decide`, { decision: "approve" });
    expect((await call(adult2, "GET", `/junior/gyms/${gym1}/leaderboard`)).status).toBe(403);
    expect((await call(adult2, "GET", `/junior/gyms/${gym2}/leaderboard`)).status).toBe(403);
  });
  it("default: juniors are hidden (opt-in); counted but not named", async () => {
    const r = await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard?period=week`);
    expect(r.status).toBe(200);
    expect(r.json.optInRequired).toBe(true);
    expect(r.json.counts).toMatchObject({ members: 3, shown: 0, hidden: 3 });
    expect(r.json.top.minutes).toEqual([]);
    expect(r.text).not.toMatch(/Mia|Noah|Leo|Pending|Eli/);
  });
  it("parents opt in; board shows first name + initial only, approved members of THIS gym only", async () => {
    expect((await call(pb, "PUT", `/junior/children/${mia}/privacy`, { showOnGymBoard: true })).status).toBe(404);
    expect((await call(pa, "PUT", `/junior/children/${mia}/privacy`, { showOnGymBoard: true })).json.settings.showOnGymBoard).toBe(true);
    expect((await call(pb, "PUT", `/junior/children/${noah}/privacy`, { showOnGymBoard: true })).status).toBe(200);
    const r = await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard?period=week`);
    expect(r.json.counts).toMatchObject({ members: 3, shown: 2, hidden: 1 });
    expect(r.json.top.minutes.map((x: any) => [x.name, x.trainingMinutes])).toEqual([["Mia K.", 180], ["Noah B.", 120]]);
    expect(r.json.top.sessions.map((x: any) => x.name)).toEqual(["Mia K.", "Noah B."]);
    expect(r.json.top.streak[0]).toMatchObject({ name: "Mia K.", streakWeeks: 3 });
    expect(r.text).not.toMatch(/Kowalski|Berg|Leo|Park|Pending|Eli|birth|email/i);
  });
  it("most improved vs the prior period (Mia +120 beats Noah +120 on sessions; Leo went down)", async () => {
    await call(pc, "PUT", `/junior/children/${leo}/privacy`, { showOnGymBoard: true });
    const r = await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard?period=week`);
    expect(r.json.mostImproved.map((x: any) => x.name)).toEqual(["Mia K.", "Noah B."]);
    expect(r.json.mostImproved[0]).toMatchObject({ trainingMinutes: 180, priorMinutes: 60, delta: 120, deltaPct: 200 });
    expect(r.json.mostImproved[1]).toMatchObject({ delta: 120, deltaPct: null });
    expect(r.json.mostImproved.map((x: any) => x.name)).not.toContain("Leo P.");
    await call(pc, "PUT", `/junior/children/${leo}/privacy`, { showOnGymBoard: false });
  });
  it("attendance rate = sessions / scheduled classes for their group; star candidates need 2+ sessions", async () => {
    const r = await call(gymAdmin, "GET", `/junior/gyms/${gym1}/leaderboard?period=week`);
    expect(r.status).toBe(200);
    expect(r.json.attendance[0]).toMatchObject({ name: "Mia K.", attendanceRate: 0.5 }); // 3 of 6 classes
    expect(r.json.starCandidates.map((c: any) => c.name)).toEqual(["Mia K.", "Noah B."]);
    expect(r.json.starCandidates[0]).toMatchObject({ childId: mia, sessions: 3, alreadyAwarded: false });
    expect(r.json.gymAttendanceRate).toBeGreaterThan(0);
  });
  it("time filter changes the window; invalid period is rejected", async () => {
    const month = await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard?period=month`);
    expect(month.json.top.minutes.find((x: any) => x.name === "Mia K.").trainingMinutes).toBe(240);
    expect(month.json.period).toBe("month");
    expect((await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard?period=decade`)).status).toBe(400);
  });
  it("an approved adult who opted in appears; one who did not does not", async () => {
    const rows = (await call(adult2, "GET", "/junior/gym-join-requests")).json.requests;
    expect(rows.length).toBeGreaterThan(0);
    const a3 = await mk("ja-adult3");
    const r = await call(a3, "POST", "/junior/gym-join-requests", { gymId: gym1 });
    await call(coach, "POST", `/junior/gyms/${gym1}/membership-requests/${r.json.request.id}/decide`, { decision: "approve" });
    const before = await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard`);
    expect(before.json.counts.members).toBe(4);
    expect(before.json.counts.shown).toBe(2);
    await call(a3, "PUT", `/junior/gym-memberships/${r.json.request.id}/board`, { showOnBoard: true });
    expect((await call(coach, "GET", `/junior/gyms/${gym1}/leaderboard`)).json.counts.shown).toBe(3);
  });
  it("parent sees only their own child's rank, never other names", async () => {
    const r = await call(pa, "GET", `/junior/children/${mia}/gym-rank?period=week`);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ rank: 1, outOf: 4, trainingMinutes: 180, sessions: 3, shownOnGymBoard: true });
    expect(r.text).not.toMatch(/Noah|Leo|Berg|Park/);
    const l = await call(pc, "GET", `/junior/children/${leo}/gym-rank`);
    expect(l.json).toMatchObject({ rank: 3, shownOnGymBoard: false }); // hidden from the board, but the parent still sees their own rank
    expect((await call(pb, "GET", `/junior/children/${mia}/gym-rank`)).status).toBe(404);
    expect((await call(pa, "GET", `/junior/children/${pendingKid}/gym-rank`)).status).toBe(403); // membership not approved
    expect((await call(coach, "GET", `/junior/children/${mia}/gym-rank`)).status).toBe(404);
  });
});
