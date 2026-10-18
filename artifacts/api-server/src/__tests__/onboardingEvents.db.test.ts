/**
 * Onboarding funnel tracking against a REAL Postgres: the event endpoint
 * (auth, validation, rate limit, never 5xx), the server-side signup/finish
 * events, the admin-only funnel read, and the answer normaliser on the fighter
 * write path (old mobile/coach strings stored as the canonical set).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, fightersTable, onboardingEventsTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken, _registerStore, _registerIpStore } from "../routes/auth";
import { _eventStore, EVENT_MAX_PER_WINDOW } from "../routes/onboarding";
import { prepareFighterBody } from "../lib/fighterBody";

vi.mock("../lib/spiritAnimals", async (orig) => ({
  ...(await orig<typeof import("../lib/spiritAnimals")>()),
  deriveSpiritAnimal: async () => null,
}));

const stamp = Date.now();
let server: Server;
let base = "";
const created: string[] = [];

type Who = { id: string; token: string };

async function makeUser(label: string, isAdmin = false): Promise<Who> {
  const id = crypto.randomUUID();
  const email = `onb-evt-${label}-${stamp}@example.com`;
  await db.insert(usersTable).values({
    id,
    email,
    hashedPassword: "x",
    isAdmin,
    aiAnalysisConsentVersion: AI_CONSENT_VERSION,
    aiAnalysisConsentAt: new Date(),
  });
  created.push(id);
  return { id, token: await signToken(id, email) };
}

async function call(who: Who | null, method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(who ? { authorization: `Bearer ${who.token}` } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

const eventsFor = (id: string) => db.select().from(onboardingEventsTable).where(eq(onboardingEventsTable.userId, id));

let alice: Who;
let admin: Who;

beforeAll(async () => {
  alice = await makeUser("alice");
  admin = await makeUser("admin", true);
  const app = express();
  app.use(express.json());
  // The real app has pino-http; the auth middleware logs through req.log.
  app.use((req, _res, next) => {
    (req as any).log = { warn() {}, error() {}, info() {} };
    next();
  });
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  _eventStore.clear();
});

afterAll(async () => {
  server?.close();
  await db.delete(onboardingEventsTable).where(inArray(onboardingEventsTable.userId, created));
  await db.delete(fightersTable).where(inArray(fightersTable.userId, created));
  await db.delete(usersTable).where(inArray(usersTable.id, created));
});

describe("POST /api/onboarding/event", () => {
  it("records a valid view and complete event", async () => {
    const a = await call(alice, "POST", "/api/onboarding/event", { app: "mobile", step: "q_tired", event: "view" });
    const b = await call(alice, "POST", "/api/onboarding/event", { app: "mobile", step: "q_tired", event: "complete" });
    expect(a.status).toBe(200);
    expect(a.json).toEqual({ recorded: true });
    expect(b.status).toBe(200);
    const rows = await eventsFor(alice.id);
    expect(rows.map((r) => `${r.app}/${r.step}/${r.event}`)).toEqual(["mobile/q_tired/view", "mobile/q_tired/complete"]);
  });

  it("needs a signed-in user", async () => {
    const r = await call(null, "POST", "/api/onboarding/event", { app: "mobile", step: "name", event: "view" });
    expect(r.status).toBe(401);
  });

  it.each([
    ["unknown app", { app: "desktop", step: "name", event: "view" }],
    ["unknown step", { app: "mobile", step: "bogus", event: "view" }],
    ["a coach step on mobile", { app: "mobile", step: "details", event: "view" }],
    ["unknown event type", { app: "mobile", step: "name", event: "explode" }],
    ["server-only step", { app: "mobile", step: "finish", event: "complete" }],
    ["server-only signup", { app: "coach", step: "signup", event: "complete" }],
    ["missing fields", {}],
    ["non-string step", { app: "mobile", step: 7, event: "view" }],
  ])("rejects %s with 400 and stores nothing", async (_label, body) => {
    const before = (await eventsFor(alice.id)).length;
    const r = await call(alice, "POST", "/api/onboarding/event", body);
    expect(r.status).toBe(400);
    expect((await eventsFor(alice.id)).length).toBe(before);
  });

  it("answers 400, not 500, for a body that is not an object", async () => {
    const r = await fetch(base + "/api/onboarding/event", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${alice.token}` },
      body: JSON.stringify("hello"),
    });
    expect(r.status).toBe(400);
  });

  it("rate-limits a flood per person, without affecting someone else", async () => {
    const bob = await makeUser("bob");
    const body = { app: "coach", step: "welcome", event: "view" };
    for (let i = 0; i < EVENT_MAX_PER_WINDOW; i++) {
      expect((await call(bob, "POST", "/api/onboarding/event", body)).status).toBe(200);
    }
    const over = await call(bob, "POST", "/api/onboarding/event", body);
    expect(over.status).toBe(429);
    expect((await call(alice, "POST", "/api/onboarding/event", body)).status).toBe(200);
  }, 60_000);

  it("never 500s the client when the events table is unavailable", async () => {
    const insertSpy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("relation \"onboarding_events\" does not exist");
    });
    const r = await call(alice, "POST", "/api/onboarding/event", { app: "mobile", step: "name", event: "view" });
    insertSpy.mockRestore();
    expect(r.status).toBe(202);
    expect(r.json).toEqual({ recorded: false });
  });
});

describe("server-side signup and finish events", () => {
  beforeEach(() => {
    _registerStore.clear();
    _registerIpStore.clear();
  });

  it("register records signup for a valid app and ignores a missing or bogus one", async () => {
    const reg = async (label: string, app?: unknown) => {
      const email = `onb-evt-reg-${label}-${stamp}@example.com`;
      const r = await call(null, "POST", "/api/auth/register", {
        email,
        password: "correct-horse-battery",
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedAiConsent: true,
        aiConsentVersion: AI_CONSENT_VERSION,
        ...(app === undefined ? {} : { app }),
      });
      expect(r.status).toBe(201);
      created.push(r.json.userId);
      return r.json.userId as string;
    };
    const mobileId = await reg("m", "mobile");
    const coachId = await reg("c", "coach");
    const oldId = await reg("old");
    const bogusId = await reg("bogus", "<script>");
    expect((await eventsFor(mobileId)).map((r) => `${r.app}/${r.step}/${r.event}`)).toEqual(["mobile/signup/complete"]);
    expect((await eventsFor(coachId)).map((r) => `${r.app}/${r.step}/${r.event}`)).toEqual(["coach/signup/complete"]);
    expect(await eventsFor(oldId)).toHaveLength(0);
    expect(await eventsFor(bogusId)).toHaveLength(0);
  });

  it("the first profile save records finish for the app they used; a retry does not repeat it", async () => {
    const carol = await makeUser("carol");
    await call(carol, "POST", "/api/onboarding/event", { app: "coach", step: "welcome", event: "view" });
    const payload = {
      name: "Carol",
      dateOfBirth: "1990-05-05",
      art: "MMA",
      primarySport: "mma",
      level: "Beginner",
      trainingFrequency: "3-4x / week",
      goals: "",
      weaknesses: "",
      personality: "x",
    };
    expect((await call(carol, "POST", "/api/fighter", payload)).status).toBe(200);
    expect((await call(carol, "POST", "/api/fighter", payload)).status).toBe(200);
    const finishes = (await eventsFor(carol.id)).filter((r) => r.step === "finish");
    expect(finishes.map((r) => `${r.app}/${r.event}`)).toEqual(["coach/complete"]);
  });

  it("a profile save still succeeds when recording finish fails", async () => {
    const dan = await makeUser("dan");
    await call(dan, "POST", "/api/onboarding/event", { app: "mobile", step: "name", event: "view" });
    const realInsert = db.insert.bind(db);
    const spy = vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
      if (table === onboardingEventsTable) throw new Error("boom");
      return realInsert(table as never);
    }) as never);
    const r = await call(dan, "POST", "/api/fighter", {
      name: "Dan",
      dateOfBirth: "1990-05-05",
      art: "BJJ",
      primarySport: "bjj",
      level: "White",
      trainingFrequency: "1-2x / week",
      goals: "",
      weaknesses: "",
      personality: "x",
    });
    spy.mockRestore();
    expect(r.status).toBe(200);
    expect(r.json.fighter.name).toBe("Dan");
  });
});

describe("GET /api/admin/onboarding-funnel", () => {
  it("is forbidden for a normal user and unauthenticated callers", async () => {
    expect((await call(alice, "GET", "/api/admin/onboarding-funnel")).status).toBe(403);
    expect((await call(null, "GET", "/api/admin/onboarding-funnel")).status).toBe(401);
  });

  it("gives an admin the per-app funnel", async () => {
    const eve = await makeUser("eve");
    for (const step of ["name", "dob", "sport"]) {
      await call(eve, "POST", "/api/onboarding/event", { app: "mobile", step, event: "view" });
    }
    const r = await call(admin, "GET", "/api/admin/onboarding-funnel");
    expect(r.status).toBe(200);
    const mobile = r.json.funnel.find((f: any) => f.app === "mobile");
    const sport = mobile.steps.find((s: any) => s.step === "sport");
    expect(sport.reached).toBeGreaterThanOrEqual(1);
    expect(sport.dropped).toBeGreaterThanOrEqual(1);
    expect(r.json.funnel.map((f: any) => f.app)).toEqual(["mobile", "coach"]);
  });
});

describe("fighter writes store the canonical answers", () => {
  it("an old mobile payload ('bjj', '3-4') is stored exactly like a coach one", async () => {
    const m = await makeUser("canon-m");
    const c = await makeUser("canon-c");
    const base = { name: "Same", dateOfBirth: "1992-02-02", level: "White", goals: "", weaknesses: "", personality: "x" };
    const rm = await call(m, "POST", "/api/fighter", { ...base, art: "bjj", primarySport: "bjj", trainingFrequency: "3-4" });
    const rc = await call(c, "POST", "/api/fighter", { ...base, art: "BJJ / Grappling", primarySport: "bjj", trainingFrequency: "3-4x / week" });
    expect(rm.status).toBe(200);
    expect(rc.status).toBe(200);
    const pick = (f: any) => ({ art: f.art, primarySport: f.primarySport, level: f.level, trainingFrequency: f.trainingFrequency });
    expect(pick(rm.json.fighter)).toEqual({ art: "BJJ", primarySport: "bjj", level: "White", trainingFrequency: "3-4x / week" });
    expect(pick(rc.json.fighter)).toEqual(pick(rm.json.fighter));
  });

  it("PATCH normalises too, and keeps a styled art value", async () => {
    const p = await makeUser("canon-p");
    await call(p, "POST", "/api/fighter", {
      name: "P", dateOfBirth: "1992-02-02", art: "MMA", primarySport: "mma", level: "Beginner", trainingFrequency: "3-4x / week", goals: "", weaknesses: "", personality: "x",
    });
    const r1 = await call(p, "PATCH", "/api/fighter", { trainingFrequency: "5+" });
    expect(r1.json.fighter.trainingFrequency).toBe("5-6x / week");
    const r2 = await call(p, "PATCH", "/api/fighter", { art: "MMA (Wrestling-heavy)" });
    expect(r2.json.fighter.art).toBe("MMA (Wrestling-heavy)");
  });

  it("prepareFighterBody leaves non-objects alone", () => {
    expect(prepareFighterBody(null)).toBeNull();
    expect(prepareFighterBody([1])).toEqual([1]);
  });
});
