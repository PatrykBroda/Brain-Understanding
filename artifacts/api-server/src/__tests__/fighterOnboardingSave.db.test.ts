/**
 * The exact payload the mobile onboarding sends at "Finish setup", against a
 * REAL Postgres (DATABASE_URL). Regression: goals/weaknesses sent as `null`
 * ("left blank") were rejected with 400 "invalid fighter", so anyone who
 * skipped either question could not finish sign-up. Also covers the save being
 * idempotent (a retry after a timeout must not create a second row or error).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";
import { nullTextToDefaults } from "../lib/fighterBody";

// Keep the route off the network: the spirit animal is cosmetic and covered elsewhere.
vi.mock("../lib/spiritAnimals", async (orig) => ({
  ...(await orig<typeof import("../lib/spiritAnimals")>()),
  deriveSpiritAnimal: async () => null,
}));

const EMAIL = `onb-save-${Date.now()}@example.com`;
let server: Server;
let base = "";
let token = "";
let userId = "";

async function call(method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

const mobilePayload = (over: Record<string, unknown> = {}) => ({
  name: "Walker",
  dateOfBirth: "1995-03-14",
  art: "bjj",
  primarySport: "bjj",
  level: "White",
  trainingFrequency: "3-4",
  goals: null,
  weaknesses: null,
  personality: "Training 3-4 per week. Sport: bjj. BJJ BELT: White.",
  ...over,
});

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, userId));
  token = await signToken(userId, EMAIL);
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await db.delete(fightersTable).where(eq(fightersTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("POST /fighter as sent by mobile onboarding", () => {
  it("accepts blank goals and weaknesses sent as null and stores empty strings", async () => {
    const r = await call("POST", "/api/fighter", mobilePayload());
    expect(r.status).toBe(200);
    expect(r.json.fighter.goals).toBe("");
    expect(r.json.fighter.weaknesses).toBe("");
    const g = await call("GET", "/api/fighter");
    expect(g.json.fighter.name).toBe("Walker");
    expect(g.json.fighter.age).toBeGreaterThan(0);
  });

  it("a retried save (after a timeout) updates the same row, no duplicate, no error", async () => {
    const r = await call("POST", "/api/fighter", mobilePayload({ goals: "Compete in spring" }));
    expect(r.status).toBe(200);
    expect(r.json.fighter.goals).toBe("Compete in spring");
    const rows = await db.select().from(fightersTable).where(eq(fightersTable.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("still rejects a genuinely invalid payload (null name, bad date)", async () => {
    expect((await call("POST", "/api/fighter", mobilePayload({ name: null }))).status).toBe(400);
    expect((await call("POST", "/api/fighter", mobilePayload({ dateOfBirth: "1995-13-40" }))).status).toBe(400);
  });

  it("PATCH accepts null to clear an optional text field", async () => {
    const r = await call("PATCH", "/api/fighter", { goals: null });
    expect(r.status).toBe(200);
    expect(r.json.fighter.goals).toBe("");
  });
});

describe("nullTextToDefaults", () => {
  it("turns null blankable text fields into empty strings and leaves everything else", () => {
    expect(nullTextToDefaults({ name: "A", goals: null, weaknesses: null, bio: null, competes: null, heightCm: null, level: null })).toEqual({
      name: "A",
      goals: "",
      weaknesses: "",
      bio: "",
      competes: false,
      heightCm: null,
      level: null,
    });
  });
  it("passes non-objects through untouched", () => {
    expect(nullTextToDefaults(null)).toBeNull();
    expect(nullTextToDefaults([1])).toEqual([1]);
    expect(nullTextToDefaults("x")).toBe("x");
  });
});
