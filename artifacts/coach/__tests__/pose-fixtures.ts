import type { Landmark, PoseFrame } from "../src/lib/pose";

// Synthetic standing figure used by the pose-track tests. Normalised image
// coordinates, 33 BlazePose landmarks. This is TEST DATA ONLY (a stick figure
// built from numbers) — it is never shipped or shown as real analysis.
export type FigureOpts = {
  cx?: number; // hip-centre x
  hipY?: number; // hip-centre y (larger = lower in frame)
  scale?: number; // overall size multiplier
  facing?: 1 | -1; // 1 = facing image-right
  leadLeft?: boolean; // left foot forward
  handsUp?: number; // wrist height above shoulder line, in shoulder widths
  stance?: number; // ankle gap in shoulder widths
  lean?: number; // shoulders offset from hips, in torso lengths (+ = image-right)
  toes?: number; // toe-minus-heel offset in the facing direction (image units); 0 = feet give no facing cue
  vis?: number;
};

export function figure(o: FigureOpts = {}): Landmark[] {
  const {
    cx = 0.5,
    hipY = 0.55,
    scale = 1,
    facing = 1,
    leadLeft = true,
    handsUp = 0.3,
    stance = 1.6,
    lean = 0,
    toes = 0.05,
    vis = 0.9,
  } = o;
  const torso = 0.22 * scale;
  const shoulderW = 0.13 * scale;
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: cx, y: hipY, z: 0, visibility: vis }));
  const set = (i: number, x: number, y: number) => {
    lm[i] = { x, y, z: 0, visibility: vis };
  };
  const shY = hipY - torso;
  const shCx = cx + lean * torso;
  set(11, shCx - shoulderW / 2, shY); // left shoulder (image-left when facing camera)
  set(12, shCx + shoulderW / 2, shY);
  set(23, cx - 0.04 * scale, hipY);
  set(24, cx + 0.04 * scale, hipY);
  const wristY = shY - handsUp * shoulderW;
  set(15, shCx + facing * shoulderW * 0.9, wristY); // left wrist
  set(16, shCx + facing * shoulderW * 0.5, wristY + 0.02 * scale); // right wrist
  set(13, shCx + facing * shoulderW * 0.6, shY + 0.06 * scale);
  set(14, shCx + facing * shoulderW * 0.3, shY + 0.07 * scale);
  for (const [i, base] of [
    [17, 15],
    [19, 15],
    [21, 15],
    [18, 16],
    [20, 16],
    [22, 16],
  ] as const) {
    set(i, lm[base]!.x + 0.01, lm[base]!.y);
  }
  // head: nose sits ahead of the ear line in the facing direction
  const headY = shY - 0.09 * scale;
  set(7, shCx - 0.012 * scale, headY);
  set(8, shCx + 0.012 * scale, headY);
  set(0, shCx + facing * 0.045 * scale, headY + 0.005);
  set(2, shCx + facing * 0.03 * scale, headY - 0.01);
  set(5, shCx + facing * 0.036 * scale, headY - 0.01);
  set(9, shCx + facing * 0.035 * scale, headY + 0.03);
  set(10, shCx + facing * 0.04 * scale, headY + 0.03);
  const half = (stance * shoulderW) / 2;
  const frontX = cx + facing * half;
  const backX = cx - facing * half;
  const ankleY = hipY + 0.42 * scale;
  set(27, leadLeft ? frontX : backX, ankleY); // left ankle
  set(28, leadLeft ? backX : frontX, ankleY);
  set(25, (leadLeft ? frontX : backX) * 0.5 + cx * 0.5, hipY + 0.22 * scale);
  set(26, (leadLeft ? backX : frontX) * 0.5 + cx * 0.5, hipY + 0.22 * scale);
  for (const [i, base, dir] of [
    [29, 27, -0.3],
    [31, 27, 0.7],
    [30, 28, -0.3],
    [32, 28, 0.7],
  ] as const) {
    set(i, lm[base]!.x + facing * dir * toes * scale, lm[base]!.y + 0.01);
  }
  return lm;
}

/** n frames at dt spacing starting at t0; `make(i)` gives each frame's options (null = no pose). */
export function frames(n: number, make: (i: number) => FigureOpts | null, dt = 0.25, t0 = 0): PoseFrame[] {
  return Array.from({ length: n }, (_, i) => {
    const o = make(i);
    return { timestamp: t0 + i * dt, landmarks: o ? figure(o) : null };
  });
}
