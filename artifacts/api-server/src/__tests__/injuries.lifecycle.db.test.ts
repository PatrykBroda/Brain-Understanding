/** /injuries lifecycle against a REAL Postgres: create / list / edit / resolve / delete, owner-only access, and loud failures when storage breaks. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { db, usersTable, fightersTable, injuryLogsTable } from "@workspace/db";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

let server: Server;
let base = "";
const users: { id: string; token: string }[] = [];

async function mk(tag: string) {
  const id = crypto.randomUUID();
  const email = `injl-${tag}-${Date.now()}@example.com`;
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

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { error() {}, warn() {}, info() {}, debug() {} };
    next();
  });
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

describe("/api/injuries lifecycle", () => {
  it("creates with kind, a past date and notes, and lists it with every field", async () => {
    const a = await mk("full");
    const date = dayOffset(-3);
    const r = await call(a, "POST", "/api/injuries", { area: "shin", severity: 2, kind: "bruise", note: "kicked", date });
    expect(r.status).toBe(200);
    expect(r.json.injury).toMatchObject({
      area: "shin",
      severity: 2,
      kind: "bruise",
      note: "kicked",
      date,
      status: "active",
      resolvedAt: null,
    });
    const list = (await call(a, "GET", "/api/injuries")).json.injuries;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: r.json.injury.id, kind: "bruise", status: "active" });
  });

  it("history persists: a fresh GET (new request, as after an app restart) returns the same rows", async () => {
    const a = await mk("persist");
    await call(a, "POST", "/api/injuries", { area: "knee", severity: 3, date: dayOffset(-40) });
    await call(a, "POST", "/api/injuries", { area: "back", severity: 1 });
    const again = (await call(a, "GET", "/api/injuries")).json.injuries;
    expect(again.map((i: any) => i.area).sort()).toEqual(["back", "knee"]);
  });

  it("edits severity, note, kind and date", async () => {
    const a = await mk("edit");
    const id = (await call(a, "POST", "/api/injuries", { area: "elbow", severity: 1 })).json.injury.id;
    const date = dayOffset(-2);
    const r = await call(a, "PATCH", `/api/injuries/${id}`, { severity: 3, note: "swollen", kind: "sprain", date });
    expect(r.status).toBe(200);
    expect(r.json.injury).toMatchObject({ id, severity: 3, note: "swollen", kind: "sprain", date, status: "active" });
    expect((await call(a, "GET", "/api/injuries")).json.injuries[0]).toMatchObject({ severity: 3, kind: "sprain" });
  });

  it("resolve marks recovered (kept in history) and PATCH status active reopens it", async () => {
    const a = await mk("resolve");
    const id = (await call(a, "POST", "/api/injuries", { area: "hip", severity: 2 })).json.injury.id;
    const done = await call(a, "POST", `/api/injuries/${id}/resolve`);
    expect(done.status).toBe(200);
    expect(done.json.injury.status).toBe("recovered");
    const got = (await call(a, "GET", "/api/injuries")).json;
    expect(done.json.injury.resolvedAt).toBe(got.today);
    expect(got.injuries).toHaveLength(1);
    const reopened = await call(a, "PATCH", `/api/injuries/${id}`, { status: "active" });
    expect(reopened.json.injury).toMatchObject({ status: "active", resolvedAt: null });
  });

  it("an old active injury stays in the list past 90 days; an old recovered one does not", async () => {
    const a = await mk("old");
    await call(a, "POST", "/api/injuries", { area: "neck", severity: 2, date: dayOffset(-200) });
    await call(a, "POST", "/api/injuries", { area: "groin", severity: 2, date: dayOffset(-200), status: "recovered" });
    const list = (await call(a, "GET", "/api/injuries")).json.injuries;
    expect(list.map((i: any) => i.area)).toEqual(["neck"]);
  });

  it("deletes an entry and it stays gone", async () => {
    const a = await mk("del");
    const id = (await call(a, "POST", "/api/injuries", { area: "wrist_hand", severity: 1 })).json.injury.id;
    expect((await call(a, "DELETE", `/api/injuries/${id}`)).json).toEqual({ ok: true });
    expect((await call(a, "GET", "/api/injuries")).json.injuries).toEqual([]);
  });

  it("rejects a future date, an impossible date, a bad kind, an empty patch, and unknown ids", async () => {
    const a = await mk("val2");
    const bad = [
      { area: "knee", severity: 1, date: dayOffset(10) },
      { area: "knee", severity: 1, date: "2026-02-31" },
      { area: "knee", severity: 1, kind: "broken" },
    ];
    for (const body of bad) {
      const r = await call(a, "POST", "/api/injuries", body);
      expect(r.status).toBe(400);
      expect(r.json.code).toBe("INVALID_INJURY");
    }
    const id = (await call(a, "POST", "/api/injuries", { area: "knee", severity: 1 })).json.injury.id;
    expect((await call(a, "PATCH", `/api/injuries/${id}`, {})).status).toBe(400);
    expect((await call(a, "PATCH", `/api/injuries/${id}`, { date: dayOffset(10) })).status).toBe(400);
    expect((await call(a, "PATCH", "/api/injuries/999999999", { severity: 2 })).status).toBe(404);
    expect((await call(a, "POST", "/api/injuries/999999999/resolve")).status).toBe(404);
    expect((await call(a, "PATCH", "/api/injuries/abc", { severity: 2 })).status).toBe(404);
  });

  it("moving an entry onto an occupied (day, area) is a clear 409, not a 500", async () => {
    const a = await mk("dup");
    const d = dayOffset(-1);
    await call(a, "POST", "/api/injuries", { area: "ribs", severity: 1, date: d });
    const id = (await call(a, "POST", "/api/injuries", { area: "ribs", severity: 1 })).json.injury.id;
    const r = await call(a, "PATCH", `/api/injuries/${id}`, { date: d });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("INJURY_DUPLICATE");
  });

  it("another user cannot edit or resolve my entry", async () => {
    const a = await mk("ownA");
    const b = await mk("ownB");
    const id = (await call(a, "POST", "/api/injuries", { area: "head", severity: 2 })).json.injury.id;
    expect((await call(b, "PATCH", `/api/injuries/${id}`, { severity: 3 })).status).toBe(404);
    expect((await call(b, "POST", `/api/injuries/${id}/resolve`)).status).toBe(404);
    expect((await call(a, "GET", "/api/injuries")).json.injuries[0]).toMatchObject({ severity: 2, status: "active" });
  });

  it("requires auth", async () => {
    const r = await fetch(`${base}/api/injuries`);
    expect(r.status).toBe(401);
  });
});

// Only the injury table fails; auth and fighter lookups use the real db.
function failInsert(err: Error) {
  const orig = db.insert.bind(db);
  return vi.spyOn(db, "insert").mockImplementation(((t: unknown) => {
    if (t === injuryLogsTable) throw err;
    return orig(t as never);
  }) as never);
}
function failSelect(err: Error) {
  const orig = db.select.bind(db);
  return vi.spyOn(db, "select").mockImplementation(((...a: unknown[]) => {
    const b = (orig as any)(...a);
    const from = b.from.bind(b);
    b.from = (t: unknown) => {
      if (t === injuryLogsTable) throw err;
      return from(t);
    };
    return b;
  }) as never);
}

describe("/api/injuries storage failures are loud, never silent", () => {
  // The reported bug: migration 0012 was not applied on prod, so every call threw "relation does not exist".
  const missingTable = () => Object.assign(new Error('relation "injury_logs" does not exist'), { code: "42P01" });

  it("maps a missing table / column to 503 INJURY_STORAGE_UNAVAILABLE with a readable message", async () => {
    const a = await mk("down");
    const ins = failInsert(missingTable());
    try {
      const post = await call(a, "POST", "/api/injuries", { area: "knee", severity: 2 });
      expect(post.status).toBe(503);
      expect(post.json.code).toBe("INJURY_STORAGE_UNAVAILABLE");
      expect(post.json.error).toMatch(/temporarily unavailable/i);
    } finally {
      ins.mockRestore();
    }
    // wrapped driver error: drizzle puts the pg error on .cause
    const sel = failSelect(new Error("Failed query", { cause: missingTable() }));
    try {
      const list = await call(a, "GET", "/api/injuries");
      expect(list.status).toBe(503);
      expect(list.json.code).toBe("INJURY_STORAGE_UNAVAILABLE");
    } finally {
      sel.mockRestore();
    }
  });

  it("any other database failure is a JSON 500 INJURY_SAVE_FAILED", async () => {
    const a = await mk("boom");
    const ins = failInsert(new Error("connection reset"));
    try {
      const r = await call(a, "POST", "/api/injuries", { area: "knee", severity: 2 });
      expect(r.status).toBe(500);
      expect(r.json.code).toBe("INJURY_SAVE_FAILED");
      expect(r.json.error).toBeTruthy();
    } finally {
      ins.mockRestore();
    }
  });
});
