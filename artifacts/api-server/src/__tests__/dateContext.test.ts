import { describe, expect, it } from "vitest";
import type { AthleteFact, Calibration, Fighter } from "@workspace/db";
import { pinRelative, relativeAge, stampHistoryMessage, stampLabel } from "../lib/dateContext";
import { buildDynamicContext } from "../lib/synochi";

// Harry's report: 16:00 on Tue 10 Nov in London, camp switched off, old chat says
// "18 days out" and "it's 11pm, get some rest".
const TZ = "Europe/London";
const NOW = new Date("2026-11-10T16:00:00Z");
const OLD = new Date("2026-10-24T22:40:00Z");
const YDAY = new Date("2026-11-09T23:05:00Z");

const fighter = { id: 1, name: "Harry", age: 0, primarySport: "", competes: true, level: "", art: "", trainingFrequency: "", gym: "", goals: "", weaknesses: "", personality: "", bio: "" } as unknown as Fighter;
const fact = (over: Partial<AthleteFact>): AthleteFact =>
  ({ id: 7, category: "context", topic: "Camp", content: "Fight camp, 18 days out, training tonight at 7pm", confidence: 4, evidenceCount: 1, sources: [], source: "chat", createdAt: OLD, lastConfirmedAt: null, ...over }) as unknown as AthleteFact;

describe("dated context helpers", () => {
  it("gives relative ages on the athlete's own calendar", () => {
    expect(relativeAge(YDAY, NOW, TZ)).toBe("yesterday");
    expect(relativeAge(new Date("2026-11-10T00:30:00Z"), NOW, TZ)).toBe("today");
    expect(relativeAge(OLD, NOW, TZ)).toBe("2 weeks ago");
    expect(stampLabel(YDAY, NOW, TZ)).toBe("Mon 9 Nov, 23:05 (yesterday)");
  });

  it("pins countdowns and relative days in old text, leaves today's text alone", () => {
    const t = "Fight is 18 days out, tonight I spar";
    const out = pinRelative(t, OLD, NOW, TZ, { pinDays: true });
    expect(out).toContain("18 days out [as of Sat 24 Oct, stale]");
    expect(out).toContain("tonight [on Sat 24 Oct]");
    expect(pinRelative(t, NOW, NOW, TZ, { pinDays: true })).toBe(t);
  });

  it("stamps old replayed messages and not today's", () => {
    expect(stampHistoryMessage("it's 11pm, get some rest", YDAY, NOW, TZ)).toBe("[sent Mon 9 Nov, 23:05 (yesterday)]\nit's 11pm, get some rest");
    expect(stampHistoryMessage("hi", new Date("2026-11-10T09:00:00Z"), NOW, TZ)).toBe("hi");
  });
});

describe("assembled coach context, camp off", () => {
  const cal = [{ promptText: "Fight?", answer: "Fight in 3 weeks", createdAt: OLD }] as unknown as Calibration[];
  const todayBlock = "# Today — Tue 10 Nov 2026, 16:00 (Europe/London)";

  it("BEFORE: no clock passed — facts undated, nothing says there is no camp", () => {
    const out = buildDynamicContext(fighter, [fact({})], cal, [], null, { todayBlock });
    expect(out).toContain("Fight camp, 18 days out, training tonight at 7pm");
    expect(out).not.toContain("NO ACTIVE CAMP");
    expect(out).not.toContain("Dated context");
  });

  it("AFTER: facts dated and pinned, no-camp and dated-context rules present", () => {
    const out = buildDynamicContext(fighter, [fact({})], cal, [], null, { todayBlock, now: NOW, tz: TZ });
    expect(out).toContain("NO ACTIVE CAMP");
    expect(out).toContain("noted Sat 24 Oct, 23:40 (2 weeks ago)");
    expect(out).toContain("18 days out [as of Sat 24 Oct, stale]");
    expect(out).toContain("training tonight [on Sat 24 Oct]");
    expect(out).toContain("(answered Sat 24 Oct");
    expect(out).toContain("Fight in 3 weeks [as of Sat 24 Oct, stale]");
    expect(out).toContain("it's 11pm, get some rest");
    expect(out).toContain("# Dated context");
    if (process.env.SHOW_CTX) console.log(out.split("# Deeper FRAME")[0]);
  });

  it("keeps the real camp block when a camp is active, and no 'no camp' notice", () => {
    const out = buildDynamicContext(fighter, [], [], [], "# Competition\nCOUNTDOWN: 12 day(s)", { now: NOW, tz: TZ });
    expect(out).toContain("COUNTDOWN: 12 day(s)");
    expect(out).not.toContain("NO ACTIVE CAMP");
  });
});
