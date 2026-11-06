import { describe, it, expect } from "vitest";
import { comparable, quickPair, toggleSelection, formatDelta, gapLabel, type CompareListItem } from "../lib/compareLogic";

const mk = (id: number, date: string, locked = false): CompareListItem => ({
  id,
  createdAt: date,
  sessionScore: 50,
  kind: "sparring",
  locked,
});

describe("compare picker", () => {
  const list = [
    mk(1, "2026-08-01T00:00:00Z"),
    mk(2, "2026-10-01T00:00:00Z"),
    mk(3, "2026-10-20T00:00:00Z"),
    mk(4, "2026-10-29T00:00:00Z"),
  ];
  it("quickPair picks the latest vs the analysis closest to 4 weeks earlier", () => {
    expect(quickPair(list)).toEqual([2, 4]);
  });
  it("ignores locked stubs and needs two readable analyses", () => {
    expect(quickPair([mk(1, "2026-10-29T00:00:00Z"), mk(2, "2026-10-01T00:00:00Z", true)])).toBeNull();
    expect(comparable(list.map((a) => ({ ...a, locked: a.id < 4 })))).toHaveLength(1);
  });
  it("keeps at most two selected, dropping the oldest pick", () => {
    expect(toggleSelection([], 1)).toEqual([1]);
    expect(toggleSelection([1, 2], 3)).toEqual([2, 3]);
    expect(toggleSelection([1, 2], 1)).toEqual([2]);
  });
  it("formats deltas and gaps", () => {
    expect(formatDelta(12)).toBe("+12");
    expect(formatDelta(-5)).toBe("−5");
    expect(formatDelta(0)).toBe("No change");
    expect(formatDelta(null)).toBe("–");
    expect(gapLabel(0)).toBe("Same day");
    expect(gapLabel(1)).toBe("1 day apart");
    expect(gapLabel(28)).toBe("4 weeks apart");
  });
});
