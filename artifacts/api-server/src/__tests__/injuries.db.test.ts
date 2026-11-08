/** /injuries against a REAL Postgres: upsert per (day, area), validation, owner-only delete. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { db, usersTable, fightersTable } from "@workspace/db";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

let server: Server;
let base = "";
const users: { id: string; token: string }[] = [];

async function mk(tag: string) {
  const id = crypto.randomUUID();
  const email = `inj-${tag}-${Date.now()}@example.com`;
  await db.insert(usersTable).values({
    id,
    email,
    hashedPassword: "x",
    aiAnalysisConsentVersion: AI_CONSENT_VERSION,
    aiAnalysisConsentAt: new Date(),
  });
  await db.insert(fightersTable).values({
    userId: id,
    name: tag,
    dateOfBirth: "1990-06-15",
    age: 36,
    art: "boxing",
    primarySport: "boxing",
    level: "amateur",
    trainingFrequency: "3-4",
  } as typeof fightersTable.$inferInsert);
  const u = { id, token: await signToken(id, email) };
  users.push(u);
  return u;
}

async function call(u: { token: string }, method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${u.token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

beforeAll(async () => {
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
  for (const u of users) {
    await db.delete(fightersTable).where(eq(fightersTable.userId, u.id));
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
  }
});

describe("/api/injuries", () => {
  it("starts empty", async () => {
    const a = await mk("empty");
    const r = await call(a, "GET", "/api/injuries");
    expect(r.status).toBe(200);
    expect(r.json.injuries).toEqual([]);
    expect(r.json.areas.length).toBeGreaterThan(5);
  });

  it("logs, and upserts the same area on the same day", async () => {
    const a = await mk("upsert");
    expect((await call(a, "POST", "/api/injuries", { area: "knee", severity: 1, note: "twinge" })).status).toBe(200);
    const second = await call(a, "POST", "/api/injuries", { area: "knee", severity: 3, note: "worse" });
    expect(second.json.injury.severity).toBe(3);
    await call(a, "POST", "/api/injuries", { area: "ribs", severity: 2 });
    const list = (await call(a, "GET", "/api/injuries")).json.injuries;
    expect(list).toHaveLength(2);
    expect(list.find((i: any) => i.area === "knee")).toMatchObject({ severity: 3, note: "worse" });
  });

  it("rejects bad input with INVALID_INJURY", async () => {
    const a = await mk("bad");
    for (const body of [{ area: "elbowz", severity: 1 }, { area: "knee", severity: 9 }, { severity: 1 }]) {
      const r = await call(a, "POST", "/api/injuries", body);
      expect(r.status).toBe(400);
      expect(r.json.code).toBe("INVALID_INJURY");
    }
  });

  it("only the owner can delete; others get 404", async () => {
    const a = await mk("own");
    const b = await mk("other");
    const id = (await call(a, "POST", "/api/injuries", { area: "back", severity: 2 })).json.injury.id;
    expect((await call(b, "DELETE", `/api/injuries/${id}`)).status).toBe(404);
    expect((await call(b, "GET", "/api/injuries")).json.injuries).toEqual([]);
    expect((await call(a, "DELETE", `/api/injuries/${id}`)).json).toEqual({ ok: true });
    expect((await call(a, "GET", "/api/injuries")).json.injuries).toEqual([]);
    expect((await call(a, "DELETE", `/api/injuries/${id}`)).status).toBe(404);
  });
});
