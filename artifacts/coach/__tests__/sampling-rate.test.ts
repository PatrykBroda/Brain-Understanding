import { describe, expect, it } from "vitest";
import { MAX_RATE, MIN_RATE, frameTimestamp, playbackRateFor, smoothCost, timelineBase, warmupTimestamp } from "../src/lib/sampling-rate";

describe("adaptive extraction playback rate", () => {
  it("keeps full speed when a reading is cheap, and never exceeds it", () => {
    expect(playbackRateFor(20, 0.25)).toBe(MAX_RATE);
    expect(playbackRateFor(0, 0.25)).toBe(MAX_RATE);
  });

  it("slows the video so one reading fits inside one sample slot (slow device)", () => {
    // a 600ms reading in a 250ms slot: video must advance < 250ms of media per 600ms of wall time
    const r = playbackRateFor(600, 0.25);
    expect(r).toBeLessThan(0.4);
    expect(r * 0.6).toBeLessThanOrEqual(0.25); // media advanced during one reading <= one slot
  });

  it("is clamped at the minimum for a pathologically slow device", () => {
    expect(playbackRateFor(60_000, 0.25)).toBe(MIN_RATE);
  });

  it("ignores garbage costs", () => {
    expect(playbackRateFor(Number.NaN, 0.25)).toBe(MAX_RATE);
    expect(playbackRateFor(-5, 0.25)).toBe(MAX_RATE);
    expect(smoothCost(120, Number.NaN)).toBe(120);
    expect(smoothCost(null, Number.NaN)).toBe(0);
  });

  it("smooths cost so one slow outlier does not whipsaw the rate", () => {
    expect(smoothCost(null, 100)).toBe(100);
    const after = smoothCost(100, 1000);
    expect(after).toBeGreaterThan(100);
    expect(after).toBeLessThan(1000);
  });

  it("a longer sample interval (very long clips) allows a faster rate for the same cost", () => {
    expect(playbackRateFor(500, 0.34)).toBeGreaterThan(playbackRateFor(500, 0.25));
  });
});

describe("landmarker timeline across analyses", () => {
  it("keeps real frame spacing for every clip, however many were analysed before", () => {
    let last = 0;
    const feed = (mediaTimes: number[]) => {
      const base = timelineBase(last);
      last = warmupTimestamp(base);
      const out: number[] = [last];
      for (const t of mediaTimes) {
        last = frameTimestamp(last, base, t);
        out.push(last);
      }
      return out;
    };
    const first = feed([0.04, 0.29, 0.54, 0.79]);
    const second = feed([0.04, 0.29, 0.54, 0.79]); // a second clip in the same tab, restarting at 0s
    const all = [...first, ...second];
    for (let i = 1; i < all.length; i++) expect(all[i]!).toBeGreaterThan(all[i - 1]!); // strictly increasing
    // gaps between real frames of the second clip are the true 250ms (not the old clamped +1ms)
    expect(second.slice(2).map((v, i) => v - second[i + 1]!)).toEqual([250, 250, 250]);
  });

  it("the warm-up sits before every real frame of its clip", () => {
    const base = timelineBase(12_345);
    expect(warmupTimestamp(base)).toBeGreaterThan(12_345);
    expect(warmupTimestamp(base)).toBeLessThan(frameTimestamp(warmupTimestamp(base), base, 0));
  });
});
