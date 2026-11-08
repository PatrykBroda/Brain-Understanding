import { describe, it, expect } from "vitest";
import {
  inQuietHours,
  localMinutes,
  decidePushes,
  pushesToSend,
  type PushUserContext,
} from "../lib/pushLogic";

const base = (over: Partial<PushUserContext> = {}): PushUserContext => ({
  userId: "u1",
  timeZone: "UTC",
  enabled: true,
  quietStartMin: 21 * 60,
  quietEndMin: 8 * 60,
  lastCheckinDate: null,
  analyses: [],
  competitions: [],
  ...over,
});

describe("quiet hours", () => {
  it("reads local minutes in the athlete's zone", () => {
    expect(localMinutes(new Date("2026-11-06T12:30:00Z"), "UTC")).toBe(750);
    expect(localMinutes(new Date("2026-11-06T12:30:00Z"), "Asia/Tokyo")).toBe(21 * 60 + 30);
  });
  it("wraps midnight", () => {
    const s = 21 * 60;
    const e = 8 * 60;
    expect(inQuietHours(new Date("2026-11-06T22:00:00Z"), "UTC", s, e)).toBe(true);
    expect(inQuietHours(new Date("2026-11-06T03:00:00Z"), "UTC", s, e)).toBe(true);
    expect(inQuietHours(new Date("2026-11-06T08:00:00Z"), "UTC", s, e)).toBe(false);
    expect(inQuietHours(new Date("2026-11-06T10:00:00Z"), "UTC", s, e)).toBe(false);
  });
  it("handles a same-day window and an empty one", () => {
    expect(inQuietHours(new Date("2026-11-06T13:00:00Z"), "UTC", 12 * 60, 14 * 60)).toBe(true);
    expect(inQuietHours(new Date("2026-11-06T15:00:00Z"), "UTC", 12 * 60, 14 * 60)).toBe(false);
    expect(inQuietHours(new Date("2026-11-06T03:00:00Z"), "UTC", 0, 0)).toBe(false);
  });
});

describe("decidePushes", () => {
  const now = new Date("2026-11-06T10:00:00Z");

  it("missed 3 days fires at a 3-day gap, not 2, keyed by the last check-in", () => {
    expect(decidePushes(base({ lastCheckinDate: "2026-11-04" }), now)).toEqual([]);
    const r = decidePushes(base({ lastCheckinDate: "2026-11-03" }), now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "missed_3_days", dedupeKey: "missed:2026-11-03", data: { route: "checkin" } });
  });
  it("never-checked-in users are not nagged", () => {
    expect(decidePushes(base(), now)).toEqual([]);
  });
  it("analysis finished only when fresh", () => {
    const fresh = { id: 7, createdAt: new Date("2026-11-06T09:00:00Z") };
    const old = { id: 8, createdAt: new Date("2026-11-01T09:00:00Z") };
    const r = decidePushes(base({ analyses: [fresh, old] }), now);
    expect(r.map((m) => m.dedupeKey)).toEqual(["analysis:7"]);
    expect(r[0]!.data).toEqual({ route: "analysis", analysisId: "7" });
  });
  it("fight approaching only at milestones", () => {
    const comp = (d: string) => ({ id: 3, name: "Nationals", eventDate: new Date(d) });
    expect(decidePushes(base({ competitions: [comp("2026-11-13T00:00:00Z")] }), now)[0]).toMatchObject({
      kind: "fight_approaching",
      dedupeKey: "fight:3:7",
      title: "7 days to fight day",
    });
    expect(decidePushes(base({ competitions: [comp("2026-11-07T00:00:00Z")] }), now)[0]!.title).toBe(
      "Fight day is tomorrow",
    );
    expect(decidePushes(base({ competitions: [comp("2026-11-11T00:00:00Z")] }), now)).toEqual([]);
  });
  it("uses FRAME terminology only", () => {
    const all = decidePushes(
      base({
        lastCheckinDate: "2026-11-01",
        analyses: [{ id: 1, createdAt: new Date("2026-11-06T09:00:00Z") }],
        competitions: [{ id: 1, name: "X", eventDate: new Date("2026-11-07T00:00:00Z") }],
      }),
      now,
    );
    expect(all).toHaveLength(3);
    for (const m of all) expect(`${m.title} ${m.body}`).not.toMatch(/synochi|vault|node/i);
  });
});

describe("pushesToSend", () => {
  const ctx = base({ lastCheckinDate: "2026-11-01" });
  it("sends when allowed", () => {
    expect(pushesToSend(ctx, new Date("2026-11-06T10:00:00Z"))).toHaveLength(1);
  });
  it("respects opt-out", () => {
    expect(pushesToSend({ ...ctx, enabled: false }, new Date("2026-11-06T10:00:00Z"))).toEqual([]);
  });
  it("defers during quiet hours", () => {
    expect(pushesToSend(ctx, new Date("2026-11-06T23:00:00Z"))).toEqual([]);
  });
});
