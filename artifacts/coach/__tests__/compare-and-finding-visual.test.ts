import { describe, expect, it } from "vitest";
import { buildBestWorstLanes, buildSessionLanes, specFor } from "../src/lib/pose-compare";
import { buildFindingVisual } from "../src/lib/finding-visual";
import { decodePoseTrack, encodePoseTrack } from "../src/lib/pose-track";
import type { AnalysisFinding, AnalysisKeyframe, ReplayMoment } from "../src/lib/api";
import { frames } from "./pose-fixtures";

function track(n: number, make: Parameters<typeof frames>[1], w = 1280, h = 720) {
  return decodePoseTrack(encodePoseTrack(frames(n, make), w, h)!)!;
}

const moment = (role: ReplayMoment["role"], timestamp: number): ReplayMoment => ({
  role,
  timestamp,
  label: role,
  note: "n",
});

describe("buildBestWorstLanes (best rep vs worst rep)", () => {
  const t = track(60, (i) => ({ cx: 0.3 + (i % 10) * 0.02, handsUp: i < 30 ? 0.6 : -0.4 })); // 15s

  it("builds two normalised, start-aligned windows around the two real moments", () => {
    const built = buildBestWorstLanes([moment("best_decision", 4), moment("worst_habit", 11)], t)!;
    expect(built).not.toBeNull();
    expect(built.lanes).toHaveLength(2);
    for (const lane of built.lanes) {
      expect(lane.frames[0]!.timestamp).toBe(0); // aligned at their start
      expect(lane.frames.length).toBeGreaterThanOrEqual(8);
      expect(lane.spec.scale).toBeGreaterThan(0);
    }
    expect(built.lanes[0]!.label).toContain("Best decision");
    expect(built.lanes[1]!.label).toContain("Worst habit");
    expect(built.duration).toBeLessThanOrEqual(2.5);
    // lane 0 holds the high-hands rep, lane 1 the dropped-hands rep (from the real track)
    const wristY = (lane: (typeof built.lanes)[number]) => lane.frames[4]!.landmarks[15]!.y;
    expect(wristY(built.lanes[0]!)).toBeLessThan(wristY(built.lanes[1]!));
  });

  it("is hidden (null) unless BOTH moments exist", () => {
    expect(buildBestWorstLanes([moment("best_decision", 4)], t)).toBeNull();
    expect(buildBestWorstLanes([moment("worst_habit", 4)], t)).toBeNull();
    expect(buildBestWorstLanes([moment("biggest_opportunity", 4), moment("worst_habit", 9)], t)).toBeNull();
    expect(buildBestWorstLanes([], t)).toBeNull();
  });

  it("is hidden without a track, for the same moment twice, or when a window has no pose lock", () => {
    expect(buildBestWorstLanes([moment("best_decision", 4), moment("worst_habit", 11)], null)).toBeNull();
    expect(buildBestWorstLanes([moment("best_decision", 4), moment("worst_habit", 4.2)], t)).toBeNull();
    const holey = track(60, (i) => (i >= 36 && i <= 50 ? null : {}));
    expect(buildBestWorstLanes([moment("best_decision", 4), moment("worst_habit", 11)], holey)).toBeNull();
  });
});

describe("buildSessionLanes (this session vs previous / athlete vs opponent)", () => {
  const a = track(40, () => ({ scale: 1 })); // 10s
  const b = track(24, () => ({ scale: 0.55, cx: 0.7 }), 640, 480); // 6s, different size/framing/aspect

  it("normalises each side by its own torso scale, so framing and distance don't matter", () => {
    const built = buildSessionLanes(a, b, { current: "This session", previous: "Last" })!;
    expect(built).not.toBeNull();
    expect(built.duration).toBeCloseTo(Math.min(a.endSec, b.endSec), 6);
    expect(built.lanes.map((l) => l.label)).toEqual(["This session", "Last"]);
    const sa = specFor(a)!;
    const sb = specFor(b)!;
    expect(sa.w).toBe(1280);
    expect(sb.w).toBe(640);
    expect(sa.scale).not.toBe(sb.scale);
  });

  it("returns null (comparison hidden) when a side cannot be normalised or is too short", () => {
    const tooShort = track(3, () => ({}));
    expect(buildSessionLanes(a, tooShort, { current: "a", previous: "b" })).toBeNull();
    const noHips = decodePoseTrack(
      encodePoseTrack(
        frames(8, () => ({})).map((f) => ({
          ...f,
          landmarks: f.landmarks!.map((l, i) => (i === 23 || i === 24 ? { ...l, visibility: 0 } : l)),
        })),
        640,
        360,
      )!,
    )!;
    expect(specFor(noHips)).toBeNull();
    expect(buildSessionLanes(a, noHips, { current: "a", previous: "b" })).toBeNull();
  });
});

describe("buildFindingVisual (annotated finding frames)", () => {
  // The athlete's right hand travels image-right across the clip, left foot forward facing right.
  const t = track(14, (i) => ({ cx: 0.3 + i * 0.03, facing: 1, leadLeft: true }));
  const kfs: AnalysisKeyframe[] = [
    { timestamp: 1.5, imageBase64: "data:image/jpeg;base64,AAAA", caption: "Guard dropped" },
  ];
  const finding = (extra: Partial<AnalysisFinding>): AnalysisFinding => ({
    title: "t",
    observation: "o",
    nervousSystemFraming: "n",
    severity: "high",
    area: "guard",
    ...extra,
  });

  it("rings the cited region's real landmarks and draws a measured movement arrow", () => {
    expect(t.lead).toBe("left");
    const v = buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "lead_hand" }), kfs, t)!;
    expect(v).not.toBeNull();
    const frame = t.frames.find((f) => Math.abs(f.timestamp - 1.5) < 1e-6)!;
    // lead hand = the LEFT wrist (lead side measured as "left") at the keyframe
    const wrist = frame.landmarks[15]!;
    const vbW = (t.w / t.h) * 100;
    expect(Math.abs(v.ring.cx / vbW - wrist.x)).toBeLessThan(0.03);
    expect(Math.abs(v.ring.cy / 100 - wrist.y)).toBeLessThan(0.03);
    expect(v.arrow).not.toBeNull();
    expect(v.arrow!.x2).toBeGreaterThan(v.arrow!.x1); // moving image-right, from the track
    expect(v.lookbackSec).toBeCloseTo(0.75, 2);
  });

  it("rear_hand resolves to the other wrist", () => {
    const v = buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "rear_hand" }), kfs, t)!;
    const frame = t.frames.find((f) => Math.abs(f.timestamp - 1.5) < 1e-6)!;
    const vbW = (t.w / t.h) * 100;
    expect(Math.abs(v.ring.cx / vbW - frame.landmarks[16]!.x)).toBeLessThan(0.03);
  });

  it("draws nothing without a citation, a valid keyframe, a track frame, or a measured lead side", () => {
    expect(buildFindingVisual(finding({}), kfs, t)).toBeNull();
    expect(buildFindingVisual(finding({ keyframeIndex: 5, bodyRegion: "head" }), kfs, t)).toBeNull();
    expect(buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "head" }), kfs, null)).toBeNull();
    const farKf = [{ ...kfs[0]!, timestamp: 99 }];
    expect(buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "head" }), farKf, t)).toBeNull();
    const noLead = { ...t, lead: null };
    expect(buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "lead_foot" }), kfs, noLead)).toBeNull();
    expect(buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "head" }), kfs, noLead)).not.toBeNull();
  });

  it("omits the arrow (keeps the ring) when the region didn't measurably move", () => {
    const still = track(14, () => ({ cx: 0.5 }));
    const v = buildFindingVisual(finding({ keyframeIndex: 0, bodyRegion: "hips" }), kfs, still)!;
    expect(v).not.toBeNull();
    expect(v.arrow).toBeNull();
    expect(v.lookbackSec).toBeNull();
  });
});
