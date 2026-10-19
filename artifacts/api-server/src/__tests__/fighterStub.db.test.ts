/**
 * Sign-up is name + email + password; the fighter exists from that moment as a blank stub and the
 * original onboarding questions are answered later from Profile (PATCH /fighter). Against a REAL
 * Postgres and the local provider stand-in: the stub contract, lazy creation, partial saves, and a
 * stub fighter reaching the coach prompt, State / Today's Focus, the Weekly Mission and the shared
 * prompt builder (also used by video analysis) without crashing and without inventing an age,
 * sport, level or frequency.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable, onboardingEventsTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { questionnaireAnswered, missingAnswers } from "@workspace/onboarding";
import { signToken, _registerStore, _registerIpStore } from "../routes/auth";
import { ensureFighter, stubFighterValues, stubName } from "../lib/ensureFighter";
import { baselineLine } from "../lib/memoryExtractor";
import { buildFirstReplyBlock } from "../lib/coachContext";
import { buildDynamicContext, unansweredLine } from "../lib/synochi";
import { selectCombatNotes } from "../lib/combatIntelligence";
import { startMockProviders, type MockProviders } from "./helpers/mockProviders";

const stamp = Date.now();
const NOW = "2026-10-21T03:00:00Z";
let mock: MockProviders;
let server: Server;
let base = "";
const created: string[] = [];

type Who = { id: string; token: string; email: string };

async function makeUser(label: string, opts: { admin?: boolean; displayName?: string } = {}): Promise<Who> {
  const id = crypto.randomUUID();
  const email = `stub-${label}-${stamp}@example.com`;
  await db.insert(usersTable).values({
    id,
    email,
    hashedPassword: "x",
    isAdmin: opts.admin ?? false,
    displayName: opts.displayName ?? "",
    aiAnalysisConsentVersion: AI_CONSENT_VERSION,
    aiAnalysisConsentAt: new Date(),
  });
  created.push(id);
  return { id, email, token: await signToken(id, email) };
}

async function call(who: Who | null, method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-now": NOW,
      "x-timezone": "Asia/Bangkok",
      ...(who ? { authorization: `Bearer ${who.token}` } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

async function chat(who: Who, content: string) {
  const r = await fetch(`${base}/coach/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${who.token}`, "x-test-now": NOW, "x-timezone": "Asia/Bangkok" },
    body: JSON.stringify({ content }),
  });
  const text = await r.text();
  const events = text.split("\n\n").filter((b) => b.startsWith("data: ")).map((b) => JSON.parse(b.slice(6)) as Record<string, any>);
  return { status: r.status, events, error: events.find((e) => e.error), done: events.find((e) => e.done) };
}

const fightersOf = (id: string) => db.select().from(fightersTable).where(eq(fightersTable.userId, id));

beforeAll(async () => {
  mock = await startMockProviders();
  process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] = mock.anthropicBase;
  process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = mock.openaiBase;
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
  process.env["PLANNER_CALL_TIMEOUT_MS"] = "800";
  const { default: apiRouter } = await import("../routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, () => void> }).log = { info() {}, warn() {}, error() {}, debug() {} };
    next();
  });
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  delete process.env["FRAME_ALLOW_TEST_CLOCK"];
  delete process.env["PLANNER_CALL_TIMEOUT_MS"];
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mock.close();
  for (const id of created) await db.delete(usersTable).where(eq(usersTable.id, id));
});

beforeEach(() => {
  _registerStore.clear();
  _registerIpStore.clear();
  mock.reset();
  mock.anthropicTool = (name) =>
    name === "emit_weekly_plan"
      ? {
          rationale: "A week about the goal you named.",
          items: [1, 2, 3, 4, 5].map((i) => ({
            category: ["fix", "train", "technique", "regulate", "goal_step"][i - 1],
            title: `Item ${i}`,
            detail: "Do it.",
            suggestedDays: "Any",
            sourceFactIds: [],
            sourceCalibrationKeys: ["onboarding:goals"],
            sourceLabel: "your stated goal",
          })),
        }
      : {};
});

const STUB = {
  age: 0,
  dateOfBirth: null,
  art: "",
  primarySport: "",
  level: "",
  trainingFrequency: "",
  goals: "",
  weaknesses: "",
  personality: "",
  onboardingAnswers: {},
};

describe("the stub fighter contract", () => {
  it("register creates it with the sign-up name and every answer blank", async () => {
    const email = `stub-reg-${stamp}@example.com`;
    const r = await call(null, "POST", "/auth/register", {
      email,
      password: "correct-horse-battery",
      name: "  Sam Stub ",
      app: "mobile",
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedAiConsent: true,
      aiConsentVersion: AI_CONSENT_VERSION,
    });
    expect(r.status).toBe(201);
    created.push(r.json.userId);
    const rows = await fightersOf(r.json.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Sam Stub", ...STUB });
    expect(rows[0]!.questionnaireUpdatedAt).toBeNull();
    const events = await db.select().from(onboardingEventsTable).where(eq(onboardingEventsTable.userId, r.json.userId));
    expect(events.map((e) => `${e.app}/${e.step}/${e.event}`)).toEqual(["mobile/signup/complete"]);
    // The first GET returns that same row, never null.
    const g = await call({ id: r.json.userId, email, token: r.json.token }, "GET", "/fighter");
    expect(g.json.fighter).toMatchObject({ name: "Sam Stub", ...STUB });
  });

  it("an older client that sends no name gets the part of the email before the @", async () => {
    const email = `no.name-${stamp}@example.com`;
    const r = await call(null, "POST", "/auth/register", {
      email,
      password: "correct-horse-battery",
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedAiConsent: true,
      aiConsentVersion: AI_CONSENT_VERSION,
    });
    expect(r.status).toBe(201);
    created.push(r.json.userId);
    expect((await fightersOf(r.json.userId))[0]!.name).toBe(`no.name-${stamp}`);
  });

  it("stubName prefers the sign-up name, then the display name, then the email, and caps the length", () => {
    expect(stubName("A", "B", "c@x.com")).toBe("A");
    expect(stubName("", "B", "c@x.com")).toBe("B");
    expect(stubName(" ", "", "c@x.com")).toBe("c");
    expect(stubName("", "", "")).toBe("Athlete");
    expect(stubName("x".repeat(100), "", "")).toHaveLength(60);
    expect(stubFighterValues("N")).toMatchObject({ name: "N", ...STUB });
  });

  it("GET /fighter creates the stub for an account that has none (older build / stalled onboarding)", async () => {
    const u = await makeUser("lazy", { displayName: "Lazy Larry" });
    expect(await fightersOf(u.id)).toHaveLength(0);
    const g = await call(u, "GET", "/fighter");
    expect(g.status).toBe(200);
    expect(g.json.fighter).toMatchObject({ name: "Lazy Larry", ...STUB });
    expect(await fightersOf(u.id)).toHaveLength(1);
  });

  it("is idempotent and race-safe: parallel first reads create exactly one row", async () => {
    const u = await makeUser("race");
    const rs = await Promise.all(Array.from({ length: 8 }, () => call(u, "GET", "/fighter")));
    expect(rs.every((r) => r.status === 200 && r.json.fighter?.name)).toBe(true);
    expect(new Set(rs.map((r) => r.json.fighter.id)).size).toBe(1);
    expect(await fightersOf(u.id)).toHaveLength(1);
    const again = await ensureFighter(u.id);
    expect(again?.id).toBe(rs[0]!.json.fighter.id);
    expect(await ensureFighter(crypto.randomUUID())).toBeNull(); // no such user
  });

  it("other entry points (Today) also never meet a missing fighter", async () => {
    const u = await makeUser("entry");
    expect((await call(u, "GET", "/today")).status).toBe(200);
    expect(await fightersOf(u.id)).toHaveLength(1);
  });
});

describe("saving the questions from Profile", () => {
  it("PATCH with only a date of birth, or only a sport, works and derives the age", async () => {
    const u = await makeUser("patch");
    const a = await call(u, "PATCH", "/fighter", { dateOfBirth: "1990-06-15" });
    expect(a.status).toBe(200);
    expect(a.json.fighter.dateOfBirth).toBe("1990-06-15");
    expect(a.json.fighter.age).toBeGreaterThan(30);
    expect(a.json.fighter.primarySport).toBe("");
    const b = await call(u, "PATCH", "/fighter", { primarySport: "bjj" });
    expect(b.status).toBe(200);
    expect(b.json.fighter).toMatchObject({ primarySport: "bjj", dateOfBirth: "1990-06-15" });
    expect(b.json.fighter.age).toBe(a.json.fighter.age);
  });

  it("null goals / weaknesses are accepted (no 'invalid fighter') and stored as blank", async () => {
    const u = await makeUser("nulls");
    const r = await call(u, "PATCH", "/fighter", { goals: null, weaknesses: null, level: "White" });
    expect(r.status).toBe(200);
    expect(r.json.fighter).toMatchObject({ goals: "", weaknesses: "", level: "White" });
  });

  it("values are normalised, a bad date is a 400, and an empty PATCH returns the fighter", async () => {
    const u = await makeUser("norm");
    const r = await call(u, "PATCH", "/fighter", { trainingFrequency: "5+", primarySport: "BJJ / Grappling", art: "bjj" });
    expect(r.json.fighter).toMatchObject({ trainingFrequency: "5-6x / week", primarySport: "bjj", art: "BJJ" });
    expect((await call(u, "PATCH", "/fighter", { dateOfBirth: "not-a-date" })).status).toBe(400);
    expect((await call(u, "PATCH", "/fighter", { dateOfBirth: null })).status).toBe(400);
    const empty = await call(u, "PATCH", "/fighter", {});
    expect(empty.status).toBe(200);
    expect(empty.json.fighter.trainingFrequency).toBe("5-6x / week");
  });

  it("answering marks questionnaireUpdatedAt, and questionnaireAnswered flips only when all four are in", async () => {
    const u = await makeUser("answered");
    const first = (await call(u, "GET", "/fighter")).json.fighter;
    expect(questionnaireAnswered(first)).toBe(false);
    expect(missingAnswers(first)).toEqual(["dateOfBirth", "primarySport", "level", "trainingFrequency"]);
    expect(first.questionnaireUpdatedAt).toBeNull();
    const p1 = (await call(u, "PATCH", "/fighter", { dateOfBirth: "1991-01-01", primarySport: "mma", level: "Beginner" })).json.fighter;
    expect(questionnaireAnswered(p1)).toBe(false);
    expect(missingAnswers(p1)).toEqual(["trainingFrequency"]);
    expect(p1.questionnaireUpdatedAt).not.toBeNull();
    const p2 = (await call(u, "PATCH", "/fighter", { trainingFrequency: "3-4x / week" })).json.fighter;
    expect(questionnaireAnswered(p2)).toBe(true);
  });

  it("the full original form still works as a POST on an existing stub (and goals/weaknesses may be null)", async () => {
    const u = await makeUser("post");
    await call(u, "GET", "/fighter");
    const r = await call(u, "POST", "/fighter", {
      name: "Post Person",
      dateOfBirth: "1995-03-14",
      art: "bjj",
      primarySport: "bjj",
      level: "White",
      trainingFrequency: "3-4",
      goals: null,
      weaknesses: null,
      personality: "",
    });
    expect(r.status).toBe(200);
    expect(r.json.fighter).toMatchObject({ name: "Post Person", art: "BJJ", trainingFrequency: "3-4x / week", goals: "" });
    expect(await fightersOf(u.id)).toHaveLength(1);
  });
});

describe("a stub fighter in the prompts", () => {
  it("buildDynamicContext leaves out every unanswered field and says so once", async () => {
    const u = await makeUser("ctx");
    const f = (await ensureFighter(u.id, "Blank Bo"))!;
    const text = buildDynamicContext(f, [], []);
    expect(text).toContain("Name: Blank Bo");
    expect(text).not.toMatch(/Age:/);
    expect(text).not.toMatch(/\b0 years?\b/i);
    expect(text).not.toMatch(/Art:|Training frequency:|Primary combat sport|Experience \/ rank|BJJ belt:|Stated goals|Stated weaknesses|Competes:/);
    expect(text).toContain("Not yet answered in their Profile");
    expect(text).toContain("date of birth, primary sport, belt / experience level, training frequency");
    expect(unansweredLine({ ...f, dateOfBirth: "1990-01-01", primarySport: "mma", level: "Beginner", trainingFrequency: "3-4x / week" })).toBeNull();
  });

  it("an answered fighter still gets the full profile block", async () => {
    const u = await makeUser("ctx2");
    const f = (await ensureFighter(u.id, "Full Fran"))!;
    const full = { ...f, age: 34, dateOfBirth: "1992-01-01", art: "BJJ", primarySport: "bjj", level: "Blue", trainingFrequency: "3-4x / week" };
    const text = buildDynamicContext(full, [], []);
    expect(text).toContain("Age: 34");
    expect(text).toContain("BJJ belt: Blue");
    expect(text).toContain("Training frequency: 3-4x / week");
    expect(text).not.toContain("Not yet answered");
  });

  it("the memory writer's baseline and the combat-note selector cope with blanks", async () => {
    const u = await makeUser("mem");
    const f = (await ensureFighter(u.id, "Mem Mo"))!;
    expect(baselineLine(f)).toBe("name=Mem Mo");
    expect(baselineLine({ ...f, name: "" })).toBe("(profile not answered yet)");
    expect(baselineLine({ ...f, age: 30, art: "BJJ", level: "Blue", competes: true })).toBe("name=Mem Mo | age=30 | art=BJJ | level=Blue | competes=true");
    expect(() => selectCombatNotes({ kind: "sparring", sport: f.primarySport, focus: undefined, signalText: "" })).not.toThrow();
  });

  it("the first reply block invites the Profile questions when nothing is answered, and keeps the old one when answered", () => {
    const blank = buildFirstReplyBlock({ primarySport: "", level: "", trainingFrequency: "", dateOfBirth: null, goals: "", weaknesses: "", personality: "" });
    expect(blank).toContain("# First coaching reply");
    expect(blank).toContain("Profile tab");
    expect(blank).not.toContain("ONE clear next step they can do");
    const answered = buildFirstReplyBlock({ primarySport: "mma", level: "Beginner", trainingFrequency: "3-4x / week", dateOfBirth: "1990-01-01", goals: "", weaknesses: "", personality: "" });
    expect(answered).toContain("ONE clear next step");
    expect(buildFirstReplyBlock()).toContain("ONE clear next step");
  });
});

describe("a stub fighter through the live endpoints", () => {
  it("the very first coach reply works with no answers and points to Profile", async () => {
    const u = await makeUser("chat", { admin: true });
    const r = await chat(u, "Hey coach, where do I start?");
    expect(r.status).toBe(200);
    expect(r.error).toBeUndefined();
    expect(r.done).toBeDefined();
    const sys = mock.requests.filter((q) => q.provider === "anthropic" && q.stream).at(-1)!.system;
    expect(sys).toContain("# First coaching reply");
    expect(sys).toContain("Profile tab");
    expect(sys).toContain("Not yet answered in their Profile");
    expect(sys).not.toMatch(/Age: |\b0 years?\b|Training frequency: |Stated goals/);
  });

  it("State and Today's Focus load, a check-in works, and a later answer reaches the Focus", async () => {
    const u = await makeUser("daily");
    const t = await call(u, "GET", "/today");
    expect(t.status).toBe(200);
    expect(t.json.state.name).toBeNull();
    expect(t.json.disclosure.code).toBe("no_info_ever");
    const c = await call(u, "POST", "/checkin", { sleep: 60, energy: 60, soreness: 40, stress: 40 });
    expect(c.status).toBe(200);
    const t2 = await call(u, "GET", "/today");
    expect(t2.status).toBe(200);
    await call(u, "PATCH", "/fighter", { weaknesses: "guard retention" });
    const t3 = await call(u, "GET", "/today");
    expect(JSON.stringify(t3.json.focus)).toContain("guard retention");
  });

  it("the Weekly Mission says there is nothing to build on yet, then builds once a goal is saved", async () => {
    const u = await makeUser("plan", { admin: true });
    const cur = await call(u, "GET", "/planner/current");
    expect(cur.status).toBe(200);
    expect(cur.json.canGenerate).toBe(false);
    const none = await call(u, "POST", "/planner/generate");
    expect(none.status).toBe(409);
    expect(none.json).toMatchObject({ code: "NO_SIGNALS" });
    await call(u, "PATCH", "/fighter", { goals: "win my first comp" });
    const ok = await call(u, "POST", "/planner/generate");
    expect(ok.status).toBe(200);
    expect(ok.json.plan.items).toHaveLength(5);
  }, 20_000);
});
