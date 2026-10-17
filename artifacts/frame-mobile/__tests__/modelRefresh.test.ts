import { describe, expect, it, vi } from "vitest";
import { MODEL_QUERY_KEYS, POST_CHAT_REFRESH_MS, refreshModel, scheduleModelRefreshAfterChat } from "../lib/modelRefresh";
import { factLastSeen, factSeenLabel, type ModelFact } from "../lib/athleteModel";
import { bucketByDay } from "../lib/factHistory";

describe("modelRefresh", () => {
  it("invalidates both query keys that read /memory (Profile/History and Home/State)", () => {
    const invalidateQueries = vi.fn();
    refreshModel({ invalidateQueries });
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([["memory"], ["facts"]]);
    expect(MODEL_QUERY_KEYS).toHaveLength(2);
  });

  it("re-fetches after a chat reply once the extractor has had time to write", () => {
    const invalidateQueries = vi.fn();
    const timers: { fn: () => void; ms: number }[] = [];
    scheduleModelRefreshAfterChat({ invalidateQueries }, (fn, ms) => timers.push({ fn, ms }));
    expect(timers.map((t) => t.ms)).toEqual([...POST_CHAT_REFRESH_MS]);
    expect(invalidateQueries).not.toHaveBeenCalled();
    timers.forEach((t) => t.fn());
    expect(invalidateQueries).toHaveBeenCalledTimes(2 * MODEL_QUERY_KEYS.length);
  });
});

const fact = (over: Partial<ModelFact>): ModelFact => ({
  id: 1,
  category: "weakness",
  content: "c",
  confidence: 3,
  status: "active",
  createdAt: "2026-09-01T10:00:00Z",
  ...over,
});

describe("last-seen history", () => {
  it("a re-seen observation sits on the day it was last seen, not the day it was created", () => {
    const now = new Date("2026-10-17T12:00:00");
    const old = fact({ id: 1, createdAt: "2026-09-01T10:00:00", lastConfirmedAt: "2026-10-17T09:00:00" });
    const untouched = fact({ id: 2, createdAt: "2026-09-02T10:00:00" });
    const buckets = bucketByDay([old, untouched], now);
    expect(buckets[0]!.label).toBe("Today");
    expect(buckets[0]!.facts.map((f) => f.id)).toEqual([1]);
    expect(buckets[1]!.facts.map((f) => f.id)).toEqual([2]);
  });

  it("factLastSeen falls back to creation when never re-seen", () => {
    expect(factLastSeen(fact({}))).toBe("2026-09-01T10:00:00Z");
  });

  it("factSeenLabel makes staleness visible", () => {
    const now = new Date("2026-10-17T12:00:00Z").getTime();
    expect(factSeenLabel(fact({ createdAt: "2026-10-17T08:00:00Z" }), now)).toBe("seen today");
    expect(factSeenLabel(fact({ createdAt: "2026-10-16T08:00:00Z" }), now)).toBe("seen yesterday");
    expect(factSeenLabel(fact({ createdAt: "2026-10-10T08:00:00Z" }), now)).toBe("seen 7 days ago");
    expect(factSeenLabel(fact({ createdAt: "2026-07-01T08:00:00Z" }), now)).toBe("seen 3 months ago");
  });
});
