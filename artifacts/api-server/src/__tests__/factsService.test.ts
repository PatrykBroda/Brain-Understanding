import { describe, expect, it } from "vitest";
import type { FactSource } from "@workspace/db";
import {
  deriveConfidence,
  evidenceCountOf,
  factSources,
  normalizeTopic,
} from "../lib/factsService";

const at = new Date("2026-07-01T00:00:00Z").toISOString();
const src = (type: string, ref = ""): FactSource => ({ type, ref, at });

describe("deriveConfidence", () => {
  it("single inferred sighting = 1 (hypothesis)", () => {
    expect(deriveConfidence([src("chat")])).toBe(1);
  });

  it("athlete-stated single sighting = 2", () => {
    expect(deriveConfidence([src("chat"), src("athlete_stated")])).toBe(2);
  });

  it("evidence count grows confidence, capped at +2", () => {
    expect(deriveConfidence([src("chat"), src("chat")])).toBe(2);
    expect(deriveConfidence([src("chat"), src("chat"), src("chat")])).toBe(3);
    // 5 sightings of one type: 1 + min(2,4) = 3, cap holds
    expect(deriveConfidence([src("chat"), src("chat"), src("chat"), src("chat"), src("chat")])).toBe(3);
  });

  it("cross-source corroboration adds confidence", () => {
    // chat + video: 1 + min(2,1) + (2-1) = 3
    expect(deriveConfidence([src("chat"), src("video", "video:9")])).toBe(3);
    // chat + video + calibration: 1 + 2 + 2 = 5
    expect(
      deriveConfidence([src("chat"), src("chat"), src("video"), src("calibration")]),
    ).toBe(5);
  });

  it("athlete confirmation adds one, never double-counted as evidence", () => {
    // 1 sighting + confirmed: 1 + 0 + 0 + 1 = 2 (confirmation is a marker, not a sighting)
    expect(deriveConfidence([src("chat"), src("athlete_confirmed")])).toBe(2);
    // markers alone never inflate evidence count
    expect(evidenceCountOf([src("chat"), src("athlete_confirmed"), src("athlete_stated")])).toBe(1);
  });

  it("clamps to 5 and floors at 1", () => {
    expect(
      deriveConfidence([
        src("chat"),
        src("chat"),
        src("chat"),
        src("video"),
        src("calibration"),
        src("planner"),
        src("athlete_stated"),
        src("athlete_confirmed"),
      ]),
    ).toBe(5);
    expect(deriveConfidence([])).toBe(1);
  });

  it("is deterministic — same trail, same confidence", () => {
    const trail = [src("chat"), src("video", "video:1"), src("athlete_confirmed")];
    expect(deriveConfidence(trail)).toBe(deriveConfidence([...trail]));
  });
});

describe("factSources legacy fallback", () => {
  const createdAt = new Date("2026-06-01T12:00:00Z");

  it("prefers the sources array when present", () => {
    const sources = [src("video", "video:3")];
    expect(factSources({ sources, source: "chat", createdAt })).toEqual(sources);
  });

  it("parses a bare legacy source as one sighting", () => {
    expect(factSources({ sources: [], source: "chat", createdAt })).toEqual([
      { type: "chat", ref: "", at: createdAt.toISOString() },
    ]);
  });

  it("parses a prefixed legacy source into type + ref", () => {
    expect(factSources({ sources: [], source: "video:12", createdAt })).toEqual([
      { type: "video", ref: "video:12", at: createdAt.toISOString() },
    ]);
    expect(factSources({ sources: [], source: "planner:item:tue-1", createdAt })).toEqual([
      { type: "planner", ref: "planner:item:tue-1", at: createdAt.toISOString() },
    ]);
  });

  it("legacy fact + one new corroborating source computes sensibly", () => {
    const legacy = factSources({ sources: [], source: "chat", createdAt });
    const merged = [...legacy, src("video", "video:44")];
    expect(evidenceCountOf(merged)).toBe(2);
    expect(deriveConfidence(merged)).toBe(3); // 1 + 1 evidence + 1 diversity
  });
});

describe("normalizeTopic", () => {
  it("collapses case, punctuation and whitespace", () => {
    expect(normalizeTopic("Sparring: Guard drops!")).toBe("sparring guard drops");
    expect(normalizeTopic("  guard-drops ")).toBe("guard drops");
    expect(normalizeTopic("GUARD   DROPS")).toBe("guard drops");
  });
});
