/** Roles added from inside the app: auto athlete role, athlete switch gated on AI consent, idempotency, history. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { db, usersTable, userRolesTable, fightersTable, changeHistoryTable, gymStaffTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "../lib/aiConsent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

const RUN = Date.now();
let server: Server;
let base = "";
interface U { id: string; email: string; token: string }
const mk = async (label: string, consent: boolean): Promise<U> => {
  const id = crypto.randomUUID();
  const email = `roles-${label}-${RUN}@example.com`;
  await db.insert(usersTable).values({
    id, email, hashedPassword: "x",
    ...(consent ? { aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() } : {}),
  });
  return { id, email, token: await signToken(id, email) };
};
async function call(u: U, method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${u.token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json };
}
const roleRows = async (uid: string) => (await db.select().from(userRolesTable).where(eq(userRolesTable.userId, uid))).map((r) => r.role).sort();
const hist = (uid: string) => db.select().from(changeHistoryTable).where(and(eq(changeHistoryTable.actorUserId, uid), eq(changeHistoryTable.entity, "user_role")));

beforeAll(async () => {
  process.env["JUNIOR_PORTAL_ENABLED"] = "1";
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).log = { warn() {}, error() {}, info() {}, debug() {} }; next(); });
  app.use("/api", apiRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  delete process.env["JUNIOR_PORTAL_ENABLED"];
  await new Promise<void>((r) => server.close(() => r()));
});

describe("add a role from inside the app", () => {
  it("normal account adding parent also gets athlete; athlete stays switchable", async () => {
    const u = await mk("p1", true);
    const r = await call(u, "POST", "/junior/roles", { role: "parent" });
    expect(r.status).toBe(200);
    expect(r.json.activeRole).toBe("parent");
    expect(r.json.roles.sort()).toEqual(["athlete", "parent"]);
    expect(await roleRows(u.id)).toEqual(["athlete", "parent"]);
    const me = await call(u, "GET", "/junior/me");
    expect(me.json.activeRole).toBe("parent");
    const back = await call(u, "POST", "/junior/roles", { role: "athlete" });
    expect(back.status).toBe(200);
    expect(back.json.activeRole).toBe("athlete");
  });

  it("choosing coach grants no gym access and asks nothing about a gym", async () => {
    const u = await mk("c1", true);
    const r = await call(u, "POST", "/junior/roles", { role: "coach" });
    expect(r.status).toBe(200);
    expect(r.json.roles.sort()).toEqual(["athlete", "coach"]);
    expect(await db.select().from(gymStaffTable).where(eq(gymStaffTable.userId, u.id))).toHaveLength(0);
    expect((await call(u, "GET", "/junior/me")).json.staff).toEqual([]);
  });

  it("is idempotent and writes history once per real change", async () => {
    const u = await mk("idem", true);
    for (let i = 0; i < 3; i++) expect((await call(u, "POST", "/junior/roles", { role: "parent" })).status).toBe(200);
    expect(await roleRows(u.id)).toEqual(["athlete", "parent"]);
    const h = await hist(u.id);
    expect(h).toHaveLength(2); // auto athlete + parent
    expect(h.every((x) => x.action === "added")).toBe(true);
    await call(u, "POST", "/junior/roles", { role: "coach" });
    expect(await hist(u.id)).toHaveLength(3);
  });

  it("athlete switch is refused without AI consent on a junior-start style account", async () => {
    const u = await mk("js", false);
    await db.insert(userRolesTable).values({ userId: u.id, role: "parent" });
    const r = await call(u, "POST", "/junior/roles", { role: "athlete" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("AI_CONSENT_REQUIRED");
    expect(await roleRows(u.id)).toEqual(["parent"]);
    expect(await db.select().from(fightersTable).where(eq(fightersTable.userId, u.id))).toHaveLength(0);
  });

  it("after consent is accepted the switch works, creates the fighter, and retries are safe", async () => {
    const u = await mk("js2", false);
    await db.insert(userRolesTable).values({ userId: u.id, role: "parent" });
    expect((await call(u, "POST", "/junior/roles", { role: "athlete" })).status).toBe(409);
    expect((await call(u, "PATCH", "/ai-consent", { accepted: true })).status).toBe(200);
    const r = await call(u, "POST", "/junior/roles", { role: "athlete" });
    expect(r.status).toBe(200);
    expect(r.json.roles.sort()).toEqual(["athlete", "parent"]);
    expect(await db.select().from(fightersTable).where(eq(fightersTable.userId, u.id))).toHaveLength(1);
    expect((await call(u, "POST", "/junior/roles", { role: "athlete" })).status).toBe(200);
    expect(await db.select().from(fightersTable).where(eq(fightersTable.userId, u.id))).toHaveLength(1);
  });

  it("returns 404 when the pilot flag is off", async () => {
    const u = await mk("off", true);
    delete process.env["JUNIOR_PORTAL_ENABLED"];
    const r = await call(u, "POST", "/junior/roles", { role: "parent" });
    process.env["JUNIOR_PORTAL_ENABLED"] = "1";
    expect(r.status).toBe(404);
    expect(await roleRows(u.id)).toEqual([]);
  });
});
