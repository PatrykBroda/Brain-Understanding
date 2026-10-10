import { describe, it, expect } from "vitest";

import {
  sanitisePoseTrack,
  withoutOpponent,
  trackHasFrameNear,
  POSE_BYTES_PER_FRAME,
  POSE_TRACK_MAX_BYTES,
  POSE_TRACK_MAX_FRAMES,
} from "../lib/poseTrack";

function validTrack(frames = 10, overrides: Record<string, unknown> = {}) {
  const t = Array.from({ length: frames }, (_, i) => i * 250);
  const bytes = Buffer.alloc(frames * POSE_BYTES_PER_FRAME, 7);
  return { v: 1, w: 640, h: 360, lead: "left", t, d: bytes.toString("base64"), ...overrides };
}

describe("sanitisePoseTrack — accepts well-formed tracks", () => {
  it("returns a canonical copy of a valid track", () => {
    const input = validTrack(10);
    const out = sanitisePoseTrack(input);
    expect(out).not.toBeNull();
    expect(out!.t).toEqual(input.t);
    expect(out!.t).not.toBe(input.t); // rebuilt, not the untrusted reference
    expect(out!.lead).toBe("left");
    expect(out!.d).toBe(input.d);
  });

  it("treats a missing or null lead as null, and drops unknown extra keys", () => {
    const a = sanitisePoseTrack({ ...validTrack(5), lead: null, evil: "x" });
    expect(a!.lead).toBeNull();
    expect(Object.keys(a!).sort()).toEqual(["d", "h", "lead", "t", "v", "w"]);
    const noLead = validTrack(5);
    delete (noLead as Record<string, unknown>)["lead"];
    expect(sanitisePoseTrack(noLead)!.lead).toBeNull();
  });

  it("accepts a full-size clip (220 frames) well inside the byte cap", () => {
    const out = sanitisePoseTrack(validTrack(220));
    expect(out).not.toBeNull();
    expect(out!.d.length + out!.t.length * 8).toBeLessThan(POSE_TRACK_MAX_BYTES);
  });
});

describe("sanitisePoseTrack — rejects bad input", () => {
  it("rejects non-objects, arrays, wrong version", () => {
    expect(sanitisePoseTrack(null)).toBeNull();
    expect(sanitisePoseTrack("x")).toBeNull();
    expect(sanitisePoseTrack([])).toBeNull();
    expect(sanitisePoseTrack({ ...validTrack(5), v: 2 })).toBeNull();
  });

  it("rejects an oversize payload (frame cap, and anything over the byte ceiling)", () => {
    expect(sanitisePoseTrack(validTrack(POSE_TRACK_MAX_FRAMES + 1))).toBeNull();
    // A well-formed 400-frame track is ~88KB, comfortably under the 150KB ceiling...
    expect(sanitisePoseTrack(validTrack(POSE_TRACK_MAX_FRAMES))).not.toBeNull();
    // ...but a payload padded past the ceiling is refused before it is even decoded.
    const huge = Buffer.alloc(120_000, 1).toString("base64");
    expect(sanitisePoseTrack({ ...validTrack(10), d: huge })).toBeNull();
  });

  it("rejects too few frames to draw anything", () => {
    expect(sanitisePoseTrack(validTrack(2))).toBeNull();
  });

  it("rejects a payload whose byte length does not match the frame count", () => {
    const t = validTrack(10);
    const short = Buffer.alloc(10 * POSE_BYTES_PER_FRAME - 5, 1).toString("base64");
    expect(sanitisePoseTrack({ ...t, d: short })).toBeNull();
    const long = Buffer.alloc(11 * POSE_BYTES_PER_FRAME, 1).toString("base64");
    expect(sanitisePoseTrack({ ...t, d: long })).toBeNull();
  });

  it("rejects non-base64 and empty payloads", () => {
    expect(sanitisePoseTrack({ ...validTrack(5), d: "not base64 !!!" })).toBeNull();
    expect(sanitisePoseTrack({ ...validTrack(5), d: "" })).toBeNull();
    expect(sanitisePoseTrack({ ...validTrack(5), d: 123 })).toBeNull();
  });

  it("rejects malformed timestamps (non-increasing, fractional, negative, NaN, huge)", () => {
    const base = validTrack(5);
    expect(sanitisePoseTrack({ ...base, t: [0, 250, 250, 750, 1000] })).toBeNull();
    expect(sanitisePoseTrack({ ...base, t: [0, 250, 100, 750, 1000] })).toBeNull();
    expect(sanitisePoseTrack({ ...base, t: [0, 250.5, 500, 750, 1000] })).toBeNull();
    expect(sanitisePoseTrack({ ...base, t: [-1, 250, 500, 750, 1000] })).toBeNull();
    expect(sanitisePoseTrack({ ...base, t: [0, 250, 500, NaN, 1000] })).toBeNull();
    expect(sanitisePoseTrack({ ...base, t: [0, 250, 500, 750, 99_999_999] })).toBeNull();
    expect(sanitisePoseTrack({ ...base, t: "nope" })).toBeNull();
  });

  it("rejects bad dimensions and bad lead values", () => {
    expect(sanitisePoseTrack({ ...validTrack(5), w: 0 })).toBeNull();
    expect(sanitisePoseTrack({ ...validTrack(5), h: 1e9 })).toBeNull();
    expect(sanitisePoseTrack({ ...validTrack(5), w: "640" })).toBeNull();
    expect(sanitisePoseTrack({ ...validTrack(5), lead: "forward" })).toBeNull();
  });
});

describe("trackHasFrameNear", () => {
  const track = sanitisePoseTrack(validTrack(8))!;
  it("matches a frame within tolerance and rejects a far timestamp", () => {
    expect(trackHasFrameNear(track, 0.5)).toBe(true);
    expect(trackHasFrameNear(track, 0.52)).toBe(true);
    expect(trackHasFrameNear(track, 0.6)).toBe(false);
    expect(trackHasFrameNear(null, 0.5)).toBe(false);
  });
});

describe("sanitisePoseTrack — optional opponent (two-person clip)", () => {
  const opp = (frames = 8, o: Record<string, unknown> = {}) => {
    const v = validTrack(frames);
    return { lead: "right", t: v.t, d: v.d, ...o };
  };

  it("keeps a valid opponent, rebuilt clean, and old single-person tracks have none", () => {
    const out = sanitisePoseTrack({ ...validTrack(10), opp: { ...opp(8), evil: 1 } });
    expect(out!.opp).toBeDefined();
    expect(out!.opp!.lead).toBe("right");
    expect(Object.keys(out!.opp!).sort()).toEqual(["d", "lead", "t"]);
    expect("opp" in sanitisePoseTrack(validTrack(10))!).toBe(false);
  });

  it("a malformed opponent is dropped on its own; the athlete's track survives", () => {
    for (const bad of [
      opp(8, { d: "!!!" }),
      opp(8, { t: [0, 250] }),
      opp(8, { lead: "up" }),
      opp(8, { d: Buffer.alloc(3).toString("base64") }),
      "nope",
      [],
    ]) {
      const out = sanitisePoseTrack({ ...validTrack(10), opp: bad });
      expect(out).not.toBeNull();
      expect(out!.opp).toBeUndefined();
    }
  });

  it("an oversize opponent is dropped, not the whole track", () => {
    const big = validTrack(POSE_TRACK_MAX_FRAMES + 1);
    const out = sanitisePoseTrack({ ...validTrack(10), opp: { lead: null, t: big.t, d: big.d } });
    expect(out).not.toBeNull();
    expect(out!.opp).toBeUndefined();
  });

  it("withoutOpponent strips it", () => {
    const out = sanitisePoseTrack({ ...validTrack(10), opp: opp(8) })!;
    expect(withoutOpponent(out).opp).toBeUndefined();
    expect(withoutOpponent(out).d).toBe(out.d);
  });
});
