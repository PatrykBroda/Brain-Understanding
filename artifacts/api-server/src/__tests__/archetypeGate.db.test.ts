/**
 * The animal archetype is only assigned, shown and used by the coach once understanding of the
 * athlete's game reaches 25% (the "Model confidence" percentage). Real Postgres + the local
 * provider stand-in.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable, athleteFactsTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { signToken } from "../routes/auth";
import { startMockProviders, type MockProviders } from "./helpers/mockProviders";
import { buildDynamicContext } from "../lib/synochi";

let mock: MockProviders;
let server: Server;
let base = "";
let token = "";
let userId = "";
let fighterId = 0;

async function get(path: string) {
  const r = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

async function addFacts(categories: string[], confidence = 5, per = 3) {
  for (const category of categories) {
    for (let i = 0; i < per; i++) {
      await db.insert(athleteFactsTable).values({
        fighterId,
        category: category as never,
        topic: `${category} ${i} ${crypto.randomUUID().slice(0, 4)}`,
        content: `${category} observation ${i}`,
        confidence,
        evidenceCount: 1,
        source: "chat",
        sources: [{ type: "chat", ref: "", at: new Date().toISOString() }],
      });
    }
  }
}

beforeAll(async () => {
  mock = await startMockProviders();
  process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] = mock.anthropicBase;
  process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = mock.openaiBase;
  mock.anthropicTool = (name) => (name === "assign_spirit_animal" ? { animal: "wolf", tagline: "Patient pressure." } : {});
  const { default: apiRouter } = await import("../routes");
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: `arch-${Date.now()}@example.com`, hashedPassword: "x", isAdmin: true });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, userId));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId,
      name: "Arch",
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "BJJ",
      primarySport: "bjj",
      level: "Blue",
      trainingFrequency: "3-4x / week",
      personality: "Under fatigue they raise the pace instead of dropping it.",
      // An animal assigned by an older build, before the 25% rule.
      spiritAnimal: "wolf",
      spiritAnimalTagline: "Patient pressure.",
    } as typeof fightersTable.$inferInsert)
    .returning();
  fighterId = f!.id;
  token = await signToken(userId, "a@example.com");
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mock.close();
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("archetype gate at 25% understanding", () => {
  it("below 25% no animal is sent to the apps, even one an older build stored", async () => {
    await addFacts(["weakness"]); // one category fully covered = 12.5%
    const r = await get("/fighter");
    expect(r.json.fighter.understanding).toBe(13);
    expect(r.json.fighter.archetypeUnlocked).toBe(false);
    expect(r.json.fighter.spiritAnimal).toBe("");
    expect(r.json.fighter.spiritAnimalTagline).toBe("");
  });

  it("the coach is not told an archetype before the threshold", async () => {
    const [row] = await db.select().from(fightersTable).where(eq(fightersTable.id, fighterId));
    const facts = await db.select().from(athleteFactsTable).where(eq(athleteFactsTable.fighterId, fighterId));
    const below = buildDynamicContext(row!, facts, [], [], null);
    expect(below).not.toMatch(/Combat archetype/);
    expect(below).not.toMatch(/Gift|Shadow/);
  });

  it("at exactly 25% the animal appears and the coach is told it, without the words gift or shadow", async () => {
    await addFacts(["strength"]); // two categories fully covered = 25%
    const r = await get("/fighter");
    expect(r.json.fighter.understanding).toBe(25);
    expect(r.json.fighter.archetypeUnlocked).toBe(true);
    expect(r.json.fighter.spiritAnimal).toBe("wolf");
    const [row] = await db.select().from(fightersTable).where(eq(fightersTable.id, fighterId));
    const facts = await db.select().from(athleteFactsTable).where(eq(athleteFactsTable.fighterId, fighterId));
    const at = buildDynamicContext(row!, facts, [], [], null);
    expect(at).toMatch(/Combat archetype: Wolf/);
    expect(at).toMatch(/Core strength/);
    expect(at).toMatch(/Failure mode/);
    expect(at).not.toMatch(/\bGift\b|\bShadow\b/);
  });

  it("onboarding does not assign an archetype (nothing to read yet) and makes no AI call for one", async () => {
    const newId = crypto.randomUUID();
    await db.insert(usersTable).values({ id: newId, email: `arch2-${Date.now()}@example.com`, hashedPassword: "x" });
    await db.update(usersTable).set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() }).where(eq(usersTable.id, newId));
    const t = await signToken(newId, "b@example.com");
    mock.requests.length = 0;
    const r = await fetch(`${base}/fighter`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ name: "New", dateOfBirth: "1995-01-01", primarySport: "bjj", art: "BJJ", level: "White", trainingFrequency: "1-2x / week", onboardingAnswers: { tired: 0 } }),
    });
    const j = (await r.json()) as any;
    expect(j.fighter.spiritAnimal).toBe("");
    expect(j.fighter.archetypeUnlocked).toBe(false);
    expect(mock.requests.filter((q) => q.provider === "anthropic")).toHaveLength(0);
    await db.delete(usersTable).where(eq(usersTable.id, newId));
  });
});
