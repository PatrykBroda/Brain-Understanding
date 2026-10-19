import { describe, expect, it } from "vitest";
import { SNAP_PX, nearestMarker } from "../src/lib/playback";

describe("timeline marker snapping", () => {
  // 40s clip on a 350px bar: 8.75 px per second, so events 0.25s apart are ~2px apart
  const dur = 40;
  const width = 350;
  const marks = [10, 10.25, 20];

  it("picks the nearest of two markers that overlap (their old 20px hit boxes both covered the tap)", () => {
    expect(nearestMarker(marks, dur, (10 / dur) * width - 0.5, width)).toBe(10);
    expect(nearestMarker(marks, dur, (10.25 / dur) * width + 0.5, width)).toBe(10.25);
  });

  it("returns null when no marker is within reach, so the bar seeks to the pointer instead", () => {
    expect(nearestMarker(marks, dur, (15 / dur) * width, width)).toBeNull();
    expect(nearestMarker([], dur, 100, width)).toBeNull();
  });

  it("reaches a marker from SNAP_PX away but not beyond", () => {
    const x = (20 / dur) * width;
    expect(nearestMarker(marks, dur, x + SNAP_PX - 0.5, width)).toBe(20);
    expect(nearestMarker(marks, dur, x + SNAP_PX + 2, width)).toBeNull();
  });

  it("clamps markers outside the clip to the bar ends", () => {
    expect(nearestMarker([45], dur, width - 1, width)).toBe(45);
  });
});
