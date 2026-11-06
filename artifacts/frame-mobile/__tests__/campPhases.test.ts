import { describe, it, expect } from "vitest";
import { campPhaseKey, campPhaseInfo, campTimeline, reminderContentFor } from "../lib/campPhases";

const FALLBACK = { title: "Daily check-in", body: "default" };

describe("campPhaseKey", () => {
  it("walks back from the fight date", () => {
    expect(campPhaseKey({ daysToEvent: 80, daysToWeighIn: null })).toBe("build");
    expect(campPhaseKey({ daysToEvent: 43, daysToWeighIn: null })).toBe("build");
    expect(campPhaseKey({ daysToEvent: 42, daysToWeighIn: null })).toBe("hard");
    expect(campPhaseKey({ daysToEvent: 15, daysToWeighIn: null })).toBe("hard");
    expect(campPhaseKey({ daysToEvent: 14, daysToWeighIn: null })).toBe("taper");
    expect(campPhaseKey({ daysToEvent: 4, daysToWeighIn: null })).toBe("taper");
    expect(campPhaseKey({ daysToEvent: 3, daysToWeighIn: null })).toBe("fight_week");
    expect(campPhaseKey({ daysToEvent: 0, daysToWeighIn: null })).toBe("fight_week");
  });
  it("weight cut only with a weigh-in, and fight week still wins", () => {
    expect(campPhaseKey({ daysToEvent: 8, daysToWeighIn: 7 })).toBe("weight_cut");
    expect(campPhaseKey({ daysToEvent: 9, daysToWeighIn: 8 })).toBe("taper");
    expect(campPhaseKey({ daysToEvent: 2, daysToWeighIn: 1 })).toBe("fight_week");
    expect(campPhaseKey({ daysToEvent: 6, daysToWeighIn: null })).toBe("taper");
  });
  it("tolerates bad numbers", () => {
    expect(campPhaseKey({ daysToEvent: -3, daysToWeighIn: null })).toBe("fight_week");
    expect(campPhaseKey({ daysToEvent: NaN, daysToWeighIn: null })).toBe("fight_week");
  });
});

describe("campTimeline", () => {
  it("marks exactly one current step", () => {
    const t = campTimeline({ daysToEvent: 20, daysToWeighIn: 19 });
    expect(t.map((s) => s.key)).toEqual(["build", "hard", "taper", "weight_cut", "fight_week"]);
    expect(t.filter((s) => s.current).map((s) => s.key)).toEqual(["hard"]);
  });
  it("omits weight cut without a weigh-in", () => {
    const t = campTimeline({ daysToEvent: 5, daysToWeighIn: null });
    expect(t.map((s) => s.key)).toEqual(["build", "hard", "taper", "fight_week"]);
    expect(t.find((s) => s.current)!.key).toBe("taper");
  });
});

describe("copy", () => {
  it("changes the reminder by phase and falls back with no camp", () => {
    const a = reminderContentFor({ daysToEvent: 30, daysToWeighIn: null }, FALLBACK);
    const b = reminderContentFor({ daysToEvent: 2, daysToWeighIn: null }, FALLBACK);
    expect(a).not.toEqual(b);
    expect(reminderContentFor(null, FALLBACK)).toEqual(FALLBACK);
  });
  it("uses FRAME terminology only", () => {
    for (const d of [60, 30, 10, 5, 1]) {
      const p = campPhaseInfo({ daysToEvent: d, daysToWeighIn: d - 1 });
      expect(`${p.homeLine} ${p.reminderTitle} ${p.reminderBody}`).not.toMatch(/synochi|vault|node/i);
    }
  });
});
