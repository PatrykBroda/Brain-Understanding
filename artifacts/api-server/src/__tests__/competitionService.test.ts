import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  competitionsTable: {},
}));

import {
  phaseFor,
  tierFor,
  weightCutFor,
  pressureFor,
  type PressureTier,
} from "../lib/competitionService";
import type { Competition } from "@workspace/db";

function makeComp(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 1,
    fighterId: 1,
    eventName: "Test Open",
    discipline: "",
    eventDate: new Date("2026-12-31T00:00:00Z"),
    weighInDate: null,
    targetWeight: "",
    currentWeight: "",
    notes: "",
    status: "scheduled",
    opponent: "",
    promotion: "",
    weightClass: "",
    rounds: null,
    location: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Competition;
}

describe("tierFor", () => {
  it("maps day counts to the five pressure tiers", () => {
    expect(tierFor(60).tier).toBe("base");
    expect(tierFor(42).tier).toBe("build");
    expect(tierFor(14).tier).toBe("sharpen");
    expect(tierFor(7).tier).toBe("peak");
    expect(tierFor(3).tier).toBe("fight_week");
    expect(tierFor(0).tier).toBe("fight_week");
  });
});

describe("phaseFor", () => {
  it("collapses five tiers into four athlete-facing phases", () => {
    const cases: Array<[PressureTier, string]> = [
      ["base", "Build"],
      ["build", "Develop"],
      ["sharpen", "Sharpen"],
      ["peak", "Fight Week"],
      ["fight_week", "Fight Week"],
    ];
    for (const [tier, phase] of cases) {
      expect(phaseFor(tier)).toBe(phase);
    }
  });
});

describe("weightCutFor", () => {
  it("computes a real difference with unit from parseable values", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "80kg", targetWeight: "77kg" }));
    expect(wc.difference).toBe(3);
    expect(wc.unit).toBe("kg");
    expect(wc.status).toBe("3kg to cut");
  });

  it("handles lbs and 'under weight'", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "168 lbs", targetWeight: "170 lbs" }));
    expect(wc.difference).toBe(-2);
    expect(wc.status).toBe("2lb under");
  });

  it("reads on-weight when equal", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "77", targetWeight: "77" }));
    expect(wc.status).toBe("On weight");
  });

  it("returns Calibrating when only one side is known", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "", targetWeight: "77kg" }));
    expect(wc.status).toBe("Calibrating");
    expect(wc.difference).toBeNull();
  });

  it("returns Unavailable when neither is parseable", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "", targetWeight: "" }));
    expect(wc.status).toBe("Unavailable");
  });

  it("refuses to invent a difference across mismatched units", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "170 lbs", targetWeight: "77kg" }));
    expect(wc.difference).toBeNull();
    expect(wc.unit).toBeNull();
    expect(wc.status).toBe("Calibrating");
    expect(wc.currentNum).toBe(170);
    expect(wc.targetNum).toBe(77);
  });

  it("refuses to invent a difference when only the target carries a unit", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "170", targetWeight: "77kg" }));
    expect(wc.difference).toBeNull();
    expect(wc.unit).toBeNull();
    expect(wc.status).toBe("Calibrating");
    expect(wc.currentNum).toBe(170);
    expect(wc.targetNum).toBe(77);
  });

  it("refuses to invent a difference when only the current carries a unit", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "170lb", targetWeight: "77" }));
    expect(wc.difference).toBeNull();
    expect(wc.unit).toBeNull();
    expect(wc.status).toBe("Calibrating");
    expect(wc.currentNum).toBe(170);
    expect(wc.targetNum).toBe(77);
  });

  it("never fabricates a number from junk text", () => {
    const wc = weightCutFor(makeComp({ currentWeight: "soon", targetWeight: "lean" }));
    expect(wc.currentNum).toBeNull();
    expect(wc.targetNum).toBeNull();
    expect(wc.status).toBe("Unavailable");
  });
});

describe("pressureFor", () => {
  it("includes the collapsed phase in the pressure payload", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const comp = makeComp({ eventDate: new Date("2026-01-10T00:00:00Z") });
    const p = pressureFor(comp, now);
    expect(p.tier).toBe("sharpen");
    expect(p.phase).toBe("Sharpen");
    expect(p.daysToEvent).toBe(9);
  });
});
