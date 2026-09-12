import { describe, expect, it } from "vitest";
import {
  isBjjSport,
  levelLabelForSport,
  levelsForSport,
} from "../src/lib/fighter-options";

describe("coach fighter options", () => {
  it("identifies BJJ and labels its level as a belt", () => {
    expect(isBjjSport("bjj")).toBe(true);
    expect(levelLabelForSport("bjj")).toBe("BJJ belt");
    expect(levelsForSport("bjj")).toContain("Purple");
  });

  it.each(["mma", "boxing", "muay_thai", "kickboxing", "taekwondo", "other"])(
    "uses experience wording and choices for %s",
    (sport) => {
      expect(isBjjSport(sport)).toBe(false);
      expect(levelLabelForSport(sport)).toBe("Experience level");
      expect(levelsForSport(sport)).toEqual([
        "Beginner",
        "Intermediate",
        "Advanced",
        "Amateur Competitor",
        "Professional",
      ]);
    },
  );

  it("uses rank wording for judo", () => {
    expect(levelLabelForSport("judo")).toBe("Rank");
  });
});