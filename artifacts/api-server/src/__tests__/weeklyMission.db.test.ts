/**
 * Weekly Mission against a REAL Postgres and the local provider stand-in:
 * initial load never builds (and never spins), Generate completes and shows the plan,
 * the plan is saved and survives a reopen, refresh replaces it (FRAME+ only), and
 * failures come back as a clear error with a retry flag instead of a hang or silence.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, fightersTable, weeklyPlansTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { signToken } from "../routes/auth";
import { startMockProviders, type MockProviders } from "./helpers/mockProviders";

let mock: MockProviders;
let server: Server;
let base = "";
const users: { id: string; token: string; fighterId: number }[] = [];

const NOW = "2026-10-21T03:00:00Z"; // Wed 21 Oct 10:00 in Asia/Bangkok
const NEXT_WEEK = "2026-10-27T03:00:00Z";

function plan(n = 5) {
  const cats = ["fix", "train", "technique", "regulate", "goal_step", "train", "fix"];
  return {
    rationale: "This week is about guard retention under fatigue.",
    items: Array.from({ length: n }, (_, i) => ({
      category: cats[i],
      title: `Item ${i + 1}`,
      detail: "Do the one thing.",
      suggestedDays: "Mon, Wed",
      sourceFactIds: [],
      sourceCalibrationKeys: ["onboarding:weaknesses"],
      sourceLabel: "your stated weakness",
    })),
  };
}

async function makeUser(opts: { admin: boolean; weaknesses?: string; goals?: string }) {
  const id = crypto.randomUUID();
  await db.insert(usersTable).values({ id, email: `mission-${id}@example.com`, hashedPassword: "x", isAdmin: opts.admin });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, id));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId: id,
      name: "Mission",
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "BJJ",
      primarySport: "bjj",
      level: "Blue",
      trainingFrequency: "3-4x / week",
      goals: opts.goals ?? "",
      weaknesses: opts.weaknesses ?? "guard retention",
    } as typeof fightersTable.$inferInsert)
    .returning();
  const u = { id, token: await signToken(id, `mission-${id}@example.com`), fighterId: f!.id };
  users.push(u);
  return u;
}

async function call(u: { token: string }, method: string, path: string, now = NOW) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${u.token}`, "x-test-now": now, "x-timezone": "Asia/Bangkok" },
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

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
  for (const u of users) await db.delete(usersTable).where(eq(usersTable.id, u.id));
});

beforeEach(() => {
  mock.reset();
  mock.anthropicTool = (name) => (name === "emit_weekly_plan" ? plan() : {});
});

describe("Weekly Mission", () => {
  it("initial load returns at once with no plan and does NOT build one (no spinner)", async () => {
    const u = await makeUser({ admin: true });
    const t0 = Date.now();
    const r = await call(u, "GET", "/planner/current");
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(r.status).toBe(200);
    expect(r.json.plan).toBeNull();
    expect(r.json.canGenerate).toBe(true);
    expect(r.json.weekStart).toBe("2026-10-19T00:00:00.000Z"); // Monday of that local week
    expect(mock.requests).toHaveLength(0);
  });

  it("Generate completes, returns the plan, and it is still there after a reopen", async () => {
    const u = await makeUser({ admin: true });
    const g = await call(u, "POST", "/planner/generate");
    expect(g.status).toBe(200);
    expect(g.json.plan.items).toHaveLength(5);
    expect(g.json.plan.rationale).toMatch(/guard retention/);
    // "Close and reopen": a fresh read returns the same saved plan.
    const again = await call(u, "GET", "/planner/current");
    expect(again.json.plan.id).toBe(g.json.plan.id);
    expect(again.json.plan.items.map((i: any) => i.title)).toEqual(g.json.plan.items.map((i: any) => i.title));
    const rows = await db.select().from(weeklyPlansTable).where(eq(weeklyPlansTable.fighterId, u.fighterId));
    expect(rows).toHaveLength(1);
  }, 20_000);

  it("the planner no longer sends the whole vault: its prompt is small", async () => {
    const u = await makeUser({ admin: true });
    await call(u, "POST", "/planner/generate");
    const sent = mock.requests.find((q) => q.provider === "anthropic" && !q.stream)!;
    expect(sent.chars).toBeLessThan(40_000);
  });

  it("a new week starts empty; the old plan keeps its own week", async () => {
    const u = await makeUser({ admin: true });
    await call(u, "POST", "/planner/generate");
    const next = await call(u, "GET", "/planner/current", NEXT_WEEK);
    expect(next.json.plan).toBeNull();
    expect(next.json.weekStart).toBe("2026-10-26T00:00:00.000Z");
  });

  it("Refresh replaces the plan for FRAME+; the same call on a free account asks to upgrade", async () => {
    const plus = await makeUser({ admin: true });
    const first = await call(plus, "POST", "/planner/generate");
    mock.anthropicTool = () => ({ ...plan(6), rationale: "Second take." });
    const second = await call(plus, "POST", "/planner/regenerate");
    expect(second.status).toBe(200);
    expect(second.json.plan.items).toHaveLength(6);
    expect(second.json.plan.id).toBe(first.json.plan.id);

    const free = await makeUser({ admin: false });
    mock.anthropicTool = (name) => (name === "emit_weekly_plan" ? plan() : {});
    // The first mission of the week is free (this used to do nothing: it answered 402 with nothing to show)...
    const built = await call(free, "POST", "/planner/regenerate");
    expect(built.status).toBe(200);
    expect(built.json.preview).toBe(true);
    expect(built.json.plan.items[1].locked).toBe(true);
    // ...replacing it is FRAME+.
    const replace = await call(free, "POST", "/planner/regenerate");
    expect(replace.status).toBe(402);
    expect(replace.json.code).toBe("FRAME_PLUS_REQUIRED");
  }, 20_000);

  it("when the provider is busy it ends with a clear, retryable error, then works on retry", async () => {
    const u = await makeUser({ admin: true });
    mock.anthropic = { mode: "status", status: 429 };
    mock.openai = { mode: "status", status: 429 };
    const r = await call(u, "POST", "/planner/generate");
    expect(r.status).toBe(503);
    expect(r.json).toMatchObject({ code: "AI_BUSY", retryable: true });
    expect(r.json.error).toMatch(/Try again/);
    // Nothing half-saved.
    expect((await call(u, "GET", "/planner/current")).json.plan).toBeNull();
    // Retry once the provider recovers.
    mock.reset();
    mock.anthropicTool = (name) => (name === "emit_weekly_plan" ? plan() : {});
    const ok = await call(u, "POST", "/planner/generate");
    expect(ok.status).toBe(200);
  }, 40_000);

  it("a provider that never answers times out with a clear error instead of spinning forever", async () => {
    const u = await makeUser({ admin: true });
    mock.firstByteDelayMs = 4_000; // longer than the 800 ms test timeout
    const t0 = Date.now();
    const r = await call(u, "POST", "/planner/generate");
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(r.status).toBe(504);
    expect(r.json).toMatchObject({ code: "GENERATION_TIMEOUT", retryable: true });
  }, 40_000);

  it("an athlete the coach knows nothing about gets an honest message, not an invented plan", async () => {
    const u = await makeUser({ admin: true, weaknesses: "", goals: "" });
    const g = await call(u, "GET", "/planner/current");
    expect(g.json.canGenerate).toBe(false);
    const r = await call(u, "POST", "/planner/generate");
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ code: "NO_SIGNALS", retryable: false });
    expect(mock.requests).toHaveLength(0);
  });

  it("a double tap joins the same build instead of starting two", async () => {
    const u = await makeUser({ admin: true });
    mock.firstByteDelayMs = 300;
    const [a, b] = await Promise.all([call(u, "POST", "/planner/generate"), call(u, "POST", "/planner/generate")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(mock.requests.filter((q) => q.provider === "anthropic" && !q.stream)).toHaveLength(1);
    await db.execute(sql`select 1`);
  }, 20_000);
});
