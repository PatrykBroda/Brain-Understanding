/**
 * PATCH /fighter name handling against a REAL Postgres (DATABASE_URL):
 * the athlete can rename themselves; blank / whitespace / over-long names are
 * rejected and the stored name is left untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

const EMAIL = `fighter-name-${Date.now()}@example.com`;
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

async function storedName() {
  const [row] = await db.select().from(fightersTable).where(eq(fightersTable.userId, userId));
  return row?.name;
}

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, userId));
  await db.insert(fightersTable).values({
    userId,
    name: "Original Name",
    dateOfBirth: "1990-06-15",
    age: 36,
    art: "boxing",
    primarySport: "boxing",
    level: "amateur",
    trainingFrequency: "3-4",
  } as typeof fightersTable.$inferInsert);
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

describe("PATCH /fighter name", () => {
  it("updates the name, trimmed, and GET /fighter returns it", async () => {
    const r = await call("PATCH", "/api/fighter", { name: "  Sasha Petrov  " });
    expect(r.status).toBe(200);
    expect(r.json.fighter.name).toBe("Sasha Petrov");
    expect(await storedName()).toBe("Sasha Petrov");
    const g = await call("GET", "/api/fighter");
    expect(g.json.fighter.name).toBe("Sasha Petrov");
  });

  it.each([["empty", ""], ["whitespace only", "   \t "]])("rejects an %s name and keeps the old one", async (_l, name) => {
    const before = await storedName();
    const r = await call("PATCH", "/api/fighter", { name });
    expect(r.status).toBe(400);
    expect(await storedName()).toBe(before);
  });

  it("rejects a name over the max length", async () => {
    const before = await storedName();
    const r = await call("PATCH", "/api/fighter", { name: "x".repeat(61) });
    expect(r.status).toBe(400);
    expect(await storedName()).toBe(before);
  });

  it("accepts a name of exactly the max length", async () => {
    const r = await call("PATCH", "/api/fighter", { name: "y".repeat(60) });
    expect(r.status).toBe(200);
  });

  it("leaves the name alone when a patch omits it", async () => {
    await call("PATCH", "/api/fighter", { name: "Keep Me" });
    const r = await call("PATCH", "/api/fighter", { trainingFrequency: "5+" });
    expect(r.status).toBe(200);
    expect(r.json.fighter.name).toBe("Keep Me");
  });

  it("POST /fighter also rejects a blank name", async () => {
    const r = await call("POST", "/api/fighter", {
      name: "  ",
      dateOfBirth: "1990-06-15",
      art: "boxing",
      primarySport: "boxing",
      level: "amateur",
      trainingFrequency: "3-4",
    });
    expect(r.status).toBe(400);
  });
});
