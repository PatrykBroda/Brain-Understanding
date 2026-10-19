/**
 * The daily loop against a REAL Postgres with an injected clock: State and
 * Today's Focus roll over at the athlete's midnight (Asia/Bangkok, UTC+7 — a day
 * that starts 7h before UTC's), previous check-ins keep their dates, and a day
 * with nothing new says so instead of presenting yesterday as today.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  fightersTable,
  athleteFactsTable,
  conversationsTable,
  messagesTable,
  dailyContextTable,
} from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

const EMAIL = `daily-loop-${Date.now()}@example.com`;
const TZ = "Asia/Bangkok";
let server: Server;
let base = "";
let token = "";
let userId = "";
let fighterId = 0;

// Local days in Bangkok: D1 = 2026-10-20, D2 = 2026-10-21, D3 = 2026-10-22.
const D1_0130_LOCAL = "2026-10-19T18:30:00Z"; // 01:30 on 20 Oct local, still 19 Oct in UTC
const D1_EVENING = "2026-10-20T11:00:00Z"; // 18:00 on 20 Oct local
const D2_0300_LOCAL = "2026-10-20T20:00:00Z"; // 03:00 on 21 Oct local
const D3_MORNING = "2026-10-22T01:00:00Z"; // 08:00 on 22 Oct local

async function call(method: string, path: string, now: string, payload?: unknown, tz: string | null = TZ) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-test-now": now,
      ...(tz ? { "x-timezone": tz } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

beforeAll(async () => {
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, userId));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId,
      name: "Daily Loop",
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "BJJ",
      primarySport: "bjj",
      level: "Blue",
      trainingFrequency: "3-4x / week",
      weaknesses: "guard retention, cardio",
      goals: "win the next comp",
    } as typeof fightersTable.$inferInsert)
    .returning();
  fighterId = f!.id;
  token = await signToken(userId, EMAIL);
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  delete process.env["FRAME_ALLOW_TEST_CLOCK"];
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("daily loop, athlete in Asia/Bangkok", () => {
  it("a day with nothing in it says so and invents no state", async () => {
    const r = await call("GET", "/today", D1_0130_LOCAL);
    expect(r.status).toBe(200);
    expect(r.json.date).toBe("2026-10-20");
    expect(r.json.fresh).toBe(false);
    expect(r.json.state.name).toBeNull();
    expect(r.json.focus).toBeNull();
    expect(r.json.disclosure.code).toBe("no_info_ever");
  });

  it("a check-in at 01:30 local lands on the LOCAL date, not the UTC one", async () => {
    const r = await call("POST", "/checkin", D1_0130_LOCAL, { sleep: 30, energy: 35, soreness: 40, stress: 45 });
    expect(r.status).toBe(200);
    expect(r.json.date).toBe("2026-10-20");
    expect(r.json.checkin.checkinDate).toBe("2026-10-20");
    const today = await call("GET", "/checkin/today", D1_EVENING);
    expect(today.json.date).toBe("2026-10-20");
    expect(today.json.checkin.sleep).toBe(30);
  });

  it("then State and Focus are fresh, current, dated, and explain themselves", async () => {
    const r = await call("GET", "/today", D1_EVENING);
    expect(r.json.fresh).toBe(true);
    expect(r.json.state).toMatchObject({ name: "Recovering", asOf: "2026-10-20", current: true });
    expect(r.json.state.source).toMatch(/check-in/);
    expect(r.json.focus).toMatchObject({ kind: "recovery", forDate: "2026-10-20", current: true, carriedOver: false });
    expect(r.json.focus.because.join(" ")).toMatch(/sleep 30/);
    expect(r.json.readiness.today.score).toBe(38);
    expect(r.json.disclosure.code).toBe("none");
    // The athlete's timezone is remembered on the profile.
    const [row] = await db.select().from(fightersTable).where(eq(fightersTable.id, fighterId));
    expect(row!.timezone).toBe(TZ);
  });

  it("the next local day with no new information discloses the gap and keeps the old read dated", async () => {
    const r = await call("GET", "/today", D2_0300_LOCAL);
    expect(r.json.date).toBe("2026-10-21");
    expect(r.json.fresh).toBe(false);
    expect(r.json.state).toMatchObject({ name: "Recovering", asOf: "2026-10-20", current: false });
    expect(r.json.focus).toMatchObject({ forDate: "2026-10-20", current: false });
    expect(r.json.disclosure.code).toBe("no_info_today");
    expect(r.json.disclosure.action).toBe("check_in");
    expect(r.json.disclosure.message).toMatch(/Tue 20 Oct/);
    expect(r.json.readiness.today).toBeNull();
    expect(r.json.readiness.latest).toMatchObject({ date: "2026-10-20", daysAgo: 1 });
    // No row was written for the quiet day.
    const rows = await db.select().from(dailyContextTable).where(eq(dailyContextTable.fighterId, fighterId));
    expect(rows.map((x) => x.localDate)).toEqual(["2026-10-20"]);
  });

  it("yesterday's check-in keeps its date once a new one is logged", async () => {
    const r = await call("POST", "/checkin", D2_0300_LOCAL, { sleep: 85, energy: 80, soreness: 80, stress: 75 });
    expect(r.json.date).toBe("2026-10-21");
    const res = await db.execute(
      sql`select checkin_date::text as d, sleep from daily_checkins where fighter_id = ${fighterId} order by checkin_date`,
    );
    expect(res.rows).toEqual([
      { d: "2026-10-20", sleep: 30 },
      { d: "2026-10-21", sleep: 85 },
    ]);
  });

  it("the new day gets its own State and a Focus that is not yesterday's recycled", async () => {
    const r = await call("GET", "/today", D2_0300_LOCAL);
    expect(r.json.fresh).toBe(true);
    expect(r.json.state).toMatchObject({ name: "Stable", asOf: "2026-10-21", current: true });
    expect(r.json.focus.kind).not.toBe("recovery");
    expect(r.json.focus.carriedOver).toBe(false);
    expect(r.json.history).toEqual([{ date: "2026-10-20", state: "Recovering", focusTitle: "Keep today light and clean" }]);
  });

  it("something said to the coach moves State and Focus the same day", async () => {
    const [conv] = await db.insert(conversationsTable).values({ fighterId }).returning();
    await db.insert(messagesTable).values({
      conversationId: conv!.id,
      role: "user",
      content: "Fragmented badly in sparring, kept panicking when passed",
      createdAt: new Date(D3_MORNING),
    });
    await db.insert(athleteFactsTable).values({
      fighterId,
      category: "pattern",
      topic: "panics when passed",
      content: "Loses composure when guard is passed",
      source: "chat",
      sources: [{ type: "chat", ref: "", at: D3_MORNING }],
      createdAt: new Date(D3_MORNING),
      updatedAt: new Date(D3_MORNING),
    });
    const r = await call("GET", "/today", "2026-10-22T02:00:00Z");
    expect(r.json.date).toBe("2026-10-22");
    expect(r.json.fresh).toBe(true);
    expect(r.json.state).toMatchObject({ name: "Volatile", current: true });
    expect(r.json.focus.title).toBe("panics when passed");
    expect(r.json.focus.because[0]).toMatch(/told your coach today/);
    expect(r.json.disclosure.code).toBe("no_checkin_today");
  });

  it("an invalid X-Timezone is ignored, not trusted", async () => {
    const r = await call("GET", "/checkin/today", D1_EVENING, undefined, "Mars/Olympus");
    expect(r.status).toBe(200);
    // Falls back to the stored zone (Bangkok), not UTC.
    expect(r.json.date).toBe("2026-10-20");
  });
});
