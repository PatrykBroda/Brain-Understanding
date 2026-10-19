/**
 * Sign-up asks for name, email and password; the onboarding questionnaire is stored once
 * and edited from Profile through the same endpoint, with the same validation and canonical
 * values. Edit an answer, reopen, and the next chat reply (and State/Focus) use it.
 * Real Postgres + the local provider stand-in.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { QUESTIONS } from "@workspace/onboarding";
import { startMockProviders, type MockProviders } from "./helpers/mockProviders";

let mock: MockProviders;
let server: Server;
let base = "";
const emails: string[] = [];
const NOW = "2026-10-20T11:00:00Z";

async function req(method: string, path: string, body?: unknown, token?: string, now = NOW) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-test-now": now,
      "x-timezone": "Asia/Bangkok",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* SSE */
  }
  return { status: r.status, json, text };
}

async function register(name: string | undefined) {
  const email = `q-${crypto.randomUUID()}@example.com`;
  emails.push(email);
  const r = await req("POST", "/auth/register", {
    ...(name !== undefined ? { name } : {}),
    email,
    password: "password123",
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedAiConsent: true,
    aiConsentVersion: AI_CONSENT_VERSION,
    app: "mobile",
  });
  return { r, email };
}

beforeAll(async () => {
  mock = await startMockProviders();
  process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] = mock.anthropicBase;
  process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = mock.openaiBase;
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
  const { default: apiRouter } = await import("../routes");
  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => {
    (r as unknown as { log: Record<string, () => void> }).log = { info() {}, warn() {}, error() {}, debug() {} };
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mock.close();
  for (const e of emails) await db.delete(usersTable).where(eq(usersTable.email, e));
});

describe("sign-up: name, email, password", () => {
  it("stores the name from the form and returns it from /auth/me so onboarding can start from it", async () => {
    const { r } = await register("  Harry R  ");
    expect(r.status).toBe(201);
    const me = await req("GET", "/auth/me", undefined, r.json.token);
    expect(me.json.name).toBe("Harry R");
  });
  it("rejects an over-long name, and still accepts a sign-up with no name (installed builds)", async () => {
    expect((await register("x".repeat(61))).r.status).toBe(400);
    const old = await register(undefined);
    expect(old.r.status).toBe(201);
    expect((await req("GET", "/auth/me", undefined, old.r.json.token)).json.name).toBe("");
  });
});

describe("the questionnaire on Profile", () => {
  it("answers are stored with the profile, edits persist, and the coach uses the new answer", async () => {
    const { r } = await register("Pat");
    const token = r.json.token as string;
    const answers = { tired: 0, imposed: 1, proud: 2, chaos: 3 };
    const created = await req(
      "POST",
      "/fighter",
      {
        name: "Pat",
        dateOfBirth: "1992-04-01",
        primarySport: "bjj",
        art: "BJJ",
        level: "Blue",
        trainingFrequency: "3-4x / week",
        goals: "win my first comp",
        weaknesses: "guard retention",
        onboardingAnswers: answers,
      },
      token,
    );
    expect(created.status).toBe(200);
    expect(created.json.fighter.onboardingAnswers).toEqual(answers);
    expect(created.json.fighter.personality).toBe(QUESTIONS[0]!.choices[0]!.read + " " + QUESTIONS[1]!.choices[1]!.read + " " + QUESTIONS[2]!.choices[2]!.read + " " + QUESTIONS[3]!.choices[3]!.read);

    // Edit one answer from Profile: same endpoint, same validation.
    const edited = await req("PATCH", "/fighter", { onboardingAnswers: { ...answers, chaos: 0 }, weaknesses: "cardio late in rounds" }, token);
    expect(edited.status).toBe(200);
    expect(edited.json.fighter.onboardingAnswers.chaos).toBe(0);
    expect(edited.json.fighter.personality).toContain("Chaos makes them more aggressive.");
    expect(edited.json.fighter.personality).not.toContain("stubborn");
    expect(edited.json.fighter.questionnaireUpdatedAt).toBeTruthy();

    // Close and reopen: a fresh read returns the edit.
    const reopened = await req("GET", "/fighter", undefined, token);
    expect(reopened.json.fighter.onboardingAnswers.chaos).toBe(0);
    expect(reopened.json.fighter.weaknesses).toBe("cardio late in rounds");

    // The very next chat reply is built from the edit.
    mock.requests.length = 0;
    const chat = await req("POST", "/coach/chat", { content: "How should I train this week?" }, token);
    expect(chat.text).toContain(`"done":true`);
    const sys = mock.requests.find((q) => q.provider === "anthropic" && q.stream)!.system;
    expect(sys).toContain("Chaos makes them more aggressive.");
    expect(sys).toContain("cardio late in rounds");
    expect(sys).not.toContain("go still and quiet");
  });

  it("a free-text line the athlete added about how they compete survives editing an answer", async () => {
    const { r } = await register("Note");
    const token = r.json.token as string;
    const created = await req(
      "POST",
      "/fighter",
      { name: "Note", dateOfBirth: "1992-04-01", primarySport: "bjj", art: "BJJ", level: "Blue", trainingFrequency: "3-4x / week", onboardingAnswers: { tired: 0 }, personalityNote: "Southpaw, hates being rushed." },
      token,
    );
    expect(created.json.fighter.personality).toContain("Southpaw, hates being rushed.");
    expect(created.json.fighter).not.toHaveProperty("personalityNote");
    const edited = await req("PATCH", "/fighter", { onboardingAnswers: { tired: 1 } }, token);
    expect(edited.json.fighter.personality).toContain("Southpaw, hates being rushed.");
    expect(edited.json.fighter.personality).toContain(QUESTIONS[0]!.choices[1]!.read);
    expect(edited.json.fighter.personality).not.toContain(QUESTIONS[0]!.choices[0]!.read);
  });

  it("invalid answers are dropped, not stored; canonical values are enforced", async () => {
    const { r } = await register("Val");
    const token = r.json.token as string;
    await req("POST", "/fighter", { name: "Val", dateOfBirth: "1992-04-01", primarySport: "bjj", art: "BJJ", level: "Blue", trainingFrequency: "3-4x / week" }, token);
    const bad = await req("PATCH", "/fighter", { onboardingAnswers: { tired: 9, nonsense: 1, chaos: -1, proud: 2 }, trainingFrequency: "3-4" }, token);
    expect(bad.status).toBe(200);
    expect(bad.json.fighter.onboardingAnswers).toEqual({ proud: 2 });
    // Older spelling is mapped onto the canonical value, same as onboarding.
    expect(bad.json.fighter.trainingFrequency).toBe("3-4x / week");
    // The server never accepts its own bookkeeping from the client.
    const sneaky = await req("PATCH", "/fighter", { questionnaireUpdatedAt: "2000-01-01T00:00:00Z", timezone: "Mars/Base" }, token);
    expect(sneaky.status).toBe(200);
    expect(sneaky.json.fighter.timezone).toBe("");
  });

  it("changing an answer counts as new information today for State and Focus", async () => {
    const { r } = await register("Fresh");
    const token = r.json.token as string;
    await req("POST", "/fighter", { name: "Fresh", dateOfBirth: "1992-04-01", primarySport: "bjj", art: "BJJ", level: "Blue", trainingFrequency: "3-4x / week", weaknesses: "guard retention" }, token, "2026-10-01T05:00:00Z");
    // Ten days later with no activity: nothing new.
    const quiet = await req("GET", "/today", undefined, token, "2026-10-12T05:00:00Z");
    expect(quiet.json.fresh).toBe(false);
    // Editing a Profile answer is something new.
    await req("PATCH", "/fighter", { weaknesses: "cardio late in rounds" }, token, "2026-10-12T05:30:00Z");
    const after = await req("GET", "/today", undefined, token, "2026-10-12T06:00:00Z");
    expect(after.json.fresh).toBe(true);
    expect(after.json.focus.title).toBe("cardio late in rounds");
    expect(after.json.focus.kind).toBe("onboarding");
  });
});
