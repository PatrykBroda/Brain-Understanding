import { describe, expect, it } from "vitest";
import {
  defaultLevelForSport,
  isBjjSport,
  levelLabelForSport,
  levelsForSport,
} from "../lib/fighterOptions";

describe("mobile fighter options", () => {
  it("offers BJJ belts only for BJJ", () => {
    expect(isBjjSport("bjj")).toBe(true);
    expect(levelLabelForSport("bjj")).toBe("BJJ BELT");
    expect(levelsForSport("bjj").map((option) => option.label)).toContain("Purple");
  });

  it.each(["mma", "boxing", "muay_thai", "kickboxing", "taekwondo", "other"])(
    "uses experience levels without belt wording for %s",
    (sport) => {
      const labels = levelsForSport(sport).map((option) => option.label);
      expect(isBjjSport(sport)).toBe(false);
      expect(levelLabelForSport(sport)).toBe("EXPERIENCE LEVEL");
      expect(labels).toEqual([
        "Beginner",
        "Intermediate",
        "Advanced",
        "Amateur competitor",
        "Professional",
      ]);
      expect(labels.join(" ").toLowerCase()).not.toContain("belt");
      expect(defaultLevelForSport(sport)).toBe("Beginner");
    },
  );

  it("uses neutral rank wording for judo", () => {
    expect(levelLabelForSport("judo")).toBe("RANK");
    expect(levelsForSport("judo").at(-1)?.label).toBe("No rank / other");
  });
});