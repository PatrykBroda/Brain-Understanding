import type { Landmark, PoseFrame } from "./pose";

// BlazePose landmark indices
const NOSE = 0;
const L_EAR = 7;
const R_EAR = 8;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_ANKLE = 27;
const R_ANKLE = 28;

export type NervousSystemLoad = "low" | "moderate" | "elevated" | "high";

export type Signal = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

export type MetricsResult = {
  load: NervousSystemLoad;
  loadBasis: string;
  signals: Signal[];
  framesAnalysed: number;
  poseFrames: number;
  keyMoments: { timestamp: number; reason: string }[];
};

function vis(lm: Landmark | undefined, min = 0.3): boolean {
  return !!lm && lm.visibility >= min;
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

type PerFrame = {
  t: number;
  guardDrop: number | null; // wrist below shoulder, normalised by torso (higher = hands lower)
  shrug: number | null; // ear-to-shoulder gap / shoulder width (lower = shoulders up = tension)
  hipMidX: number | null;
  stance: number | null; // ankle separation / shoulder width
  torque: number | null; // shoulder/hip rotational offset (deg)
  energy: number | null; // total joint displacement vs previous frame
};

function analyseFrame(lm: Landmark[]): Omit<PerFrame, "t" | "energy"> {
  const ls = lm[L_SHOULDER];
  const rs = lm[R_SHOULDER];
  const lh = lm[L_HIP];
  const rh = lm[R_HIP];

  let guardDrop: number | null = null;
  let shrug: number | null = null;
  let hipMidX: number | null = null;
  let stance: number | null = null;
  let torque: number | null = null;

  const haveShoulders = vis(ls) && vis(rs);
  const shoulderW = haveShoulders ? dist(ls!, rs!) : 0;

  if (haveShoulders && shoulderW > 0.02) {
    const shoulderY = (ls!.y + rs!.y) / 2;
    // guard: wrists relative to shoulder line, normalised by shoulder width
    const wrists = [lm[L_WRIST], lm[R_WRIST]].filter((w) => vis(w)) as Landmark[];
    if (wrists.length) {
      const wristY = mean(wrists.map((w) => w.y));
      guardDrop = (wristY - shoulderY) / shoulderW; // >0 hands below shoulders
    }
    // shrug: vertical gap shoulders->ears; smaller = shoulders pulled up toward ears
    const ears = [lm[L_EAR], lm[R_EAR]].filter((e) => vis(e)) as Landmark[];
    if (ears.length) {
      const earY = mean(ears.map((e) => e.y));
      shrug = (shoulderY - earY) / shoulderW; // smaller = more compressed/braced
    }
    // rotational offset between shoulder line and hip line
    if (vis(lh) && vis(rh)) {
      const shAng = Math.atan2(rs!.y - ls!.y, rs!.x - ls!.x);
      const hipAng = Math.atan2(rh!.y - lh!.y, rh!.x - lh!.x);
      let d = Math.abs(shAng - hipAng) * (180 / Math.PI);
      if (d > 180) d = 360 - d;
      torque = d;
    }
  }

  if (vis(lh) && vis(rh)) {
    hipMidX = (lh!.x + rh!.x) / 2;
    if (shoulderW > 0.02) {
      const la = lm[L_ANKLE];
      const ra = lm[R_ANKLE];
      if (vis(la) && vis(ra)) stance = dist(la!, ra!) / shoulderW;
    }
  }

  return { guardDrop, shrug, hipMidX, stance, torque };
}

const ENERGY_JOINTS = [NOSE, L_WRIST, R_WRIST, L_ANKLE, R_ANKLE, L_HIP, R_HIP];

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function nums(xs: (number | null)[]): number[] {
  return xs.filter((x): x is number => x != null && Number.isFinite(x));
}

export function computeMetrics(frames: PoseFrame[]): MetricsResult {
  const per: PerFrame[] = [];
  let prev: Landmark[] | null = null;
  for (const f of frames) {
    if (!f.landmarks) {
      prev = null;
      continue;
    }
    const base = analyseFrame(f.landmarks);
    let energy: number | null = null;
    if (prev) {
      const ds: number[] = [];
      for (const j of ENERGY_JOINTS) {
        const a = f.landmarks[j];
        const b = prev[j];
        if (vis(a) && vis(b)) ds.push(dist(a!, b!));
      }
      if (ds.length) energy = mean(ds);
    }
    per.push({ t: f.timestamp, energy, ...base });
    prev = f.landmarks;
  }

  const poseFrames = per.length;

  // ---- aggregate signals ----
  const guardVals = nums(per.map((p) => p.guardDrop));
  const shrugVals = nums(per.map((p) => p.shrug));
  const hipXVals = nums(per.map((p) => p.hipMidX));
  const stanceVals = nums(per.map((p) => p.stance));
  const torqueVals = nums(per.map((p) => p.torque));
  const energyVals = nums(per.map((p) => p.energy));

  const signals: Signal[] = [];
  let tensionScore = 0; // 0..1 contributions
  const basisParts: string[] = [];

  // Guard discipline
  if (guardVals.length) {
    const avg = mean(guardVals);
    const worst = Math.max(...guardVals);
    const dropLabel = avg < 0 ? "high" : avg < 0.25 ? "mostly held" : avg < 0.6 ? "drifting low" : "dropped";
    signals.push({
      key: "guard_height",
      label: "Guard height",
      value: dropLabel,
      detail: `hands sit on average ${avg < 0 ? "above" : "below"} the shoulder line (index ${fmt(avg)}); worst lapse ${fmt(worst)} below.`,
    });
    if (avg > 0.4) {
      tensionScore += 0.15;
      basisParts.push("guard riding low");
    }
  }

  // Shoulder bracing
  if (shrugVals.length) {
    const avg = mean(shrugVals);
    const minGap = Math.min(...shrugVals);
    const braced = avg < 0.45;
    signals.push({
      key: "shoulder_brace",
      label: "Shoulder set",
      value: braced ? "braced/high" : "settled",
      detail: `ear-to-shoulder gap averages ${fmt(avg)} of shoulder width (lower = shoulders pulled up); tightest ${fmt(minGap)}.`,
    });
    if (braced) {
      tensionScore += 0.3;
      basisParts.push("shoulders carried high");
    }
  }

  // Lateral balance drift
  if (hipXVals.length > 2) {
    const sway = std(hipXVals);
    const drifty = sway > 0.05;
    signals.push({
      key: "balance_sway",
      label: "Base / balance",
      value: drifty ? "drifting" : "anchored",
      detail: `hip centre sways ${fmt(sway, 3)} laterally across the clip (higher = more weight migration).`,
    });
    if (drifty) {
      tensionScore += 0.15;
      basisParts.push("base migrating laterally");
    }
  }

  // Stance width
  if (stanceVals.length) {
    const avg = mean(stanceVals);
    const narrow = avg < 1.1;
    signals.push({
      key: "stance_width",
      label: "Stance width",
      value: narrow ? "narrow" : avg > 2.2 ? "wide" : "balanced",
      detail: `feet average ${fmt(avg)}x shoulder width apart (narrow base = less margin under pressure).`,
    });
    if (narrow) {
      tensionScore += 0.1;
      basisParts.push("narrow base");
    }
  }

  // Rotational connection
  if (torqueVals.length) {
    const avg = mean(torqueVals);
    signals.push({
      key: "rotation",
      label: "Hip / shoulder link",
      value: avg < 8 ? "stacked (little separation)" : avg > 30 ? "heavily wound" : "connected",
      detail: `shoulder line separates from hip line by ${fmt(avg, 1)} deg on average (very low = arming strikes/movement without the hips).`,
    });
    if (avg < 8) {
      tensionScore += 0.1;
      basisParts.push("upper body disconnected from hips");
    }
  }

  // Output rhythm: bursts vs stalls
  if (energyVals.length > 3) {
    const m = mean(energyVals);
    const s = std(energyVals);
    const cov = m > 0 ? s / m : 0; // coefficient of variation
    const spiky = cov > 0.85;
    signals.push({
      key: "output_rhythm",
      label: "Output rhythm",
      value: spiky ? "bursty / uneven" : "even",
      detail: `movement comes in ${spiky ? "spikes separated by stalls" : "a steady cadence"} (variation ${fmt(cov)} of mean motion).`,
    });
    if (spiky) {
      tensionScore += 0.25;
      basisParts.push("output frantic then stalling");
    }
  }

  // ---- nervous-system load (categorical, derived from real signals) ----
  let load: NervousSystemLoad;
  if (tensionScore >= 0.65) load = "high";
  else if (tensionScore >= 0.4) load = "elevated";
  else if (tensionScore >= 0.2) load = "moderate";
  else load = "low";

  const loadBasis =
    basisParts.length > 0
      ? `derived from: ${basisParts.join(", ")}`
      : "movement reads settled across the tracked signals";

  // ---- key moments: pick frames with highest energy + worst guard + most drift ----
  const keyMoments = pickKeyMoments(per);

  return {
    load,
    loadBasis,
    signals,
    framesAnalysed: frames.length,
    poseFrames,
    keyMoments,
  };
}

function pickKeyMoments(per: PerFrame[]): { timestamp: number; reason: string }[] {
  const picks: { timestamp: number; reason: string; score: number }[] = [];
  for (const p of per) {
    if (p.energy != null && p.energy > 0) {
      picks.push({ timestamp: p.t, reason: "peak output", score: p.energy * 3 });
    }
    if (p.guardDrop != null && p.guardDrop > 0.5) {
      picks.push({ timestamp: p.t, reason: "guard low", score: p.guardDrop });
    }
    if (p.shrug != null && p.shrug < 0.4) {
      picks.push({ timestamp: p.t, reason: "shoulders braced", score: 0.6 });
    }
  }
  picks.sort((a, b) => b.score - a.score);
  // de-dupe by nearby timestamp, keep up to 5 spread across the clip
  const chosen: { timestamp: number; reason: string }[] = [];
  for (const p of picks) {
    if (chosen.length >= 5) break;
    if (chosen.some((c) => Math.abs(c.timestamp - p.timestamp) < 1.0)) continue;
    chosen.push({ timestamp: p.timestamp, reason: p.reason });
  }
  // ensure at least one frame (first posed frame)
  if (chosen.length === 0 && per.length) {
    chosen.push({ timestamp: per[Math.floor(per.length / 2)]!.t, reason: "mid-clip" });
  }
  chosen.sort((a, b) => a.timestamp - b.timestamp);
  return chosen;
}
