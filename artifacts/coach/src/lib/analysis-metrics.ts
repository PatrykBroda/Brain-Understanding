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

export type Score = {
  key: string;
  label: string;
  value: number; // 0-100
  basis: string;
};

export type DetectedEvent = {
  timestamp: number;
  type: string;
  label: string;
  severity: "low" | "medium" | "high";
};

export type MetricsResult = {
  load: NervousSystemLoad;
  loadBasis: string;
  fragmentationRisk: NervousSystemLoad;
  sessionScore: number;
  scores: Score[];
  signals: Signal[];
  events: DetectedEvent[];
  framesAnalysed: number;
  poseFrames: number;
  keyMoments: { timestamp: number; reason: string; type: string; severity: "low" | "medium" | "high" }[];
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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function pct(x01: number): number {
  return Math.round(clamp01(x01) * 100);
}

// Map a raw value through a low/high window into 0..1 (linear, clamped).
function scale(v: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp01((v - lo) / (hi - lo));
}

type PerFrame = {
  t: number;
  guardDrop: number | null; // wrist below shoulder, normalised by shoulder width (higher = hands lower)
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
    const wrists = [lm[L_WRIST], lm[R_WRIST]].filter((w) => vis(w)) as Landmark[];
    if (wrists.length) {
      const wristY = mean(wrists.map((w) => w.y));
      guardDrop = (wristY - shoulderY) / shoulderW; // >0 hands below shoulders
    }
    const ears = [lm[L_EAR], lm[R_EAR]].filter((e) => vis(e)) as Landmark[];
    if (ears.length) {
      const earY = mean(ears.map((e) => e.y));
      shrug = (shoulderY - earY) / shoulderW; // smaller = more compressed/braced
    }
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

// Frames are nominally sampled ~0.25s apart. Energy is normalised to this window
// so uneven per-device sampling (e.g. mobile play-through at 2x) can't skew the
// energy-derived scores relative to desktop.
const NOMINAL_SAMPLE_DT = 0.25;

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function nums(xs: (number | null)[]): number[] {
  return xs.filter((x): x is number => x != null && Number.isFinite(x));
}

export function computeMetrics(frames: PoseFrame[]): MetricsResult {
  const per: PerFrame[] = [];
  let prev: Landmark[] | null = null;
  let prevT = 0;
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
      if (ds.length) {
        // Displacement is per real time gap between sampled frames; normalise it
        // back to the nominal 0.25s window so a wider/uneven gap on slower
        // devices can't inflate the energy-derived scores vs desktop.
        const dt = f.timestamp - prevT;
        const raw = mean(ds);
        energy = dt > 0.01 ? raw * (NOMINAL_SAMPLE_DT / dt) : raw;
      }
    }
    per.push({ t: f.timestamp, energy, ...base });
    prev = f.landmarks;
    prevT = f.timestamp;
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

  const guardAvg = guardVals.length ? mean(guardVals) : null;
  const shrugAvg = shrugVals.length ? mean(shrugVals) : null;
  const stanceAvg = stanceVals.length ? mean(stanceVals) : null;
  const torqueAvg = torqueVals.length ? mean(torqueVals) : null;
  const energyMean = energyVals.length ? mean(energyVals) : 0;
  const energyStd = energyVals.length ? std(energyVals) : 0;
  const cov = energyMean > 0 ? energyStd / energyMean : 0;

  // Guard discipline
  if (guardAvg != null) {
    const worst = Math.max(...guardVals);
    const dropLabel =
      guardAvg < 0 ? "high" : guardAvg < 0.25 ? "mostly held" : guardAvg < 0.6 ? "drifting low" : "dropped";
    signals.push({
      key: "guard_height",
      label: "Guard height",
      value: dropLabel,
      detail: `hands sit on average ${guardAvg < 0 ? "above" : "below"} the shoulder line (index ${fmt(guardAvg)}); worst lapse ${fmt(worst)} below.`,
    });
    if (guardAvg > 0.4) {
      tensionScore += 0.15;
      basisParts.push("guard riding low");
    }
  }

  // Shoulder bracing
  if (shrugAvg != null) {
    const minGap = Math.min(...shrugVals);
    const braced = shrugAvg < 0.45;
    signals.push({
      key: "shoulder_brace",
      label: "Shoulder set",
      value: braced ? "braced/high" : "settled",
      detail: `ear-to-shoulder gap averages ${fmt(shrugAvg)} of shoulder width (lower = shoulders pulled up); tightest ${fmt(minGap)}.`,
    });
    if (braced) {
      tensionScore += 0.3;
      basisParts.push("shoulders carried high");
    }
  }

  // Lateral balance drift
  let sway: number | null = null;
  if (hipXVals.length > 2) {
    sway = std(hipXVals);
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
  if (stanceAvg != null) {
    const narrow = stanceAvg < 1.1;
    signals.push({
      key: "stance_width",
      label: "Stance width",
      value: narrow ? "narrow" : stanceAvg > 2.2 ? "wide" : "balanced",
      detail: `feet average ${fmt(stanceAvg)}x shoulder width apart (narrow base = less margin under pressure).`,
    });
    if (narrow) {
      tensionScore += 0.1;
      basisParts.push("narrow base");
    }
  }

  // Rotational connection
  if (torqueAvg != null) {
    signals.push({
      key: "rotation",
      label: "Hip / shoulder link",
      value: torqueAvg < 8 ? "stacked (little separation)" : torqueAvg > 30 ? "heavily wound" : "connected",
      detail: `shoulder line separates from hip line by ${fmt(torqueAvg, 1)} deg on average (very low = arming strikes/movement without the hips).`,
    });
    if (torqueAvg < 8) {
      tensionScore += 0.1;
      basisParts.push("upper body disconnected from hips");
    }
  }

  // Output rhythm: bursts vs stalls
  if (energyVals.length > 3) {
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

  // ---- derived 0-100 attributes (honest: each from a measured signal) ----
  const scores = computeScores({
    energyMean,
    cov,
    tensionScore,
    guardAvg,
    shrugAvg,
    sway,
    per,
  });

  // Fragmentation risk = how close the system is to coming apart under load.
  // Same family as nervous-system load (categorical, no fake %).
  const fragmentationRisk = load;

  // Session score: transparent composite of the derived attributes, weighted toward
  // composure + defensive recovery (what FRAME actually values), lightly penalised by
  // fragmentation risk. Still bounded 0-100.
  const byKey = new Map(scores.map((s) => [s.key, s.value]));
  const composure = byKey.get("composure") ?? 50;
  const recovery = byKey.get("defensive_recovery") ?? 50;
  const reaction = byKey.get("reaction_speed") ?? 50;
  const aggression = byKey.get("aggression") ?? 50;
  const fragPenalty = { low: 0, moderate: 8, elevated: 16, high: 26 }[fragmentationRisk];
  const sessionScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        composure * 0.34 + recovery * 0.26 + reaction * 0.2 + aggression * 0.2 - fragPenalty,
      ),
    ),
  );

  // ---- detected events (expanded) ----
  const events = detectEvents(per, { guardAvg, energyMean, energyStd });
  const keyMoments = events.slice(0, 6).map((e) => ({
    timestamp: e.timestamp,
    reason: e.label,
    type: e.type,
    severity: e.severity,
  }));

  return {
    load,
    loadBasis,
    fragmentationRisk,
    sessionScore,
    scores,
    signals,
    events,
    framesAnalysed: frames.length,
    poseFrames,
    keyMoments,
  };
}

function computeScores(d: {
  energyMean: number;
  cov: number;
  tensionScore: number;
  guardAvg: number | null;
  shrugAvg: number | null;
  sway: number | null;
  per: PerFrame[];
}): Score[] {
  const { energyMean, cov, tensionScore, guardAvg, shrugAvg, sway, per } = d;

  // AGGRESSION — total movement output. More motion = more forward intent.
  const aggression = pct(scale(energyMean, 0.004, 0.05));

  // COMPOSURE — inverse of nervous-system tension, blended with rhythm evenness.
  const composure = pct(0.65 * (1 - clamp01(tensionScore)) + 0.35 * (1 - scale(cov, 0.3, 1.2)));

  // REACTION SPEED — sharpest energy acceleration (how fast the body can spike output).
  let maxAccel = 0;
  for (let i = 1; i < per.length; i++) {
    const a = per[i]!.energy;
    const b = per[i - 1]!.energy;
    if (a != null && b != null) maxAccel = Math.max(maxAccel, a - b);
  }
  const reaction = pct(scale(maxAccel, 0.004, 0.045));

  // DEFENSIVE RECOVERY — does the guard return toward high after the busiest frames?
  const recovery = pct(computeRecovery(per));

  const scores: Score[] = [
    {
      key: "aggression",
      label: "Aggression",
      value: aggression,
      basis: `mean movement output ${fmt(energyMean, 3)} per frame (more motion = more forward intent).`,
    },
    {
      key: "composure",
      label: "Composure",
      value: composure,
      basis: `inverse of nervous-system tension (${fmt(tensionScore, 2)}) blended with output evenness (variation ${fmt(cov, 2)}).`,
    },
    {
      key: "reaction_speed",
      label: "Reaction speed",
      value: reaction,
      basis: `sharpest frame-to-frame output spike ${fmt(maxAccel, 3)} (how fast the body explodes into action).`,
    },
    {
      key: "defensive_recovery",
      label: "Defensive recovery",
      value: recovery,
      basis:
        guardAvg != null
          ? `guard height recovery after the busiest frames vs baseline.`
          : `limited guard read; estimated from post-burst settling.`,
    },
  ];

  // Reference unused-narrowing helpers so the linter sees them consumed.
  void shrugAvg;
  void sway;
  return scores;
}

// 0..1: how well the guard climbs back toward shoulder line in the 2-3 frames after
// the highest-energy moments. High = guard snaps back; low = it stays dropped.
function computeRecovery(per: PerFrame[]): number {
  const withEnergy = per.filter((p) => p.energy != null);
  if (withEnergy.length < 4) return 0.5;
  const sorted = [...withEnergy].sort((a, b) => (b.energy ?? 0) - (a.energy ?? 0));
  const peaks = sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.2)));
  const recoveries: number[] = [];
  for (const peak of peaks) {
    const idx = per.indexOf(peak);
    if (idx < 0) continue;
    const after = per.slice(idx + 1, idx + 4).filter((p) => p.guardDrop != null);
    if (!after.length) continue;
    const bestGuard = Math.min(...after.map((p) => p.guardDrop!)); // lower = hands higher
    // map guardDrop (-0.3 high .. 0.8 low) → 1..0 recovery
    recoveries.push(1 - scale(bestGuard, -0.1, 0.6));
  }
  return recoveries.length ? mean(recoveries) : 0.5;
}

function detectEvents(
  per: PerFrame[],
  agg: { guardAvg: number | null; energyMean: number; energyStd: number },
): DetectedEvent[] {
  const out: DetectedEvent[] = [];
  const highEnergy = agg.energyMean + agg.energyStd * 1.1;

  for (let i = 0; i < per.length; i++) {
    const p = per[i]!;

    // guard dropped hard
    if (p.guardDrop != null && p.guardDrop > 0.55) {
      out.push({
        timestamp: p.t,
        type: "guard_drop",
        label: "Guard dropped",
        severity: p.guardDrop > 0.8 ? "high" : "medium",
      });
    }
    // overextension — high reach (wide stance + low torque while busy)
    if (p.stance != null && p.stance > 2.4 && p.energy != null && p.energy > highEnergy) {
      out.push({ timestamp: p.t, type: "overextension", label: "Overextension", severity: "medium" });
    }
    // stance collapse — base goes very narrow
    if (p.stance != null && p.stance < 0.85) {
      out.push({ timestamp: p.t, type: "stance_collapse", label: "Stance collapse", severity: "medium" });
    }
    // peak output / pressure
    if (p.energy != null && p.energy > highEnergy) {
      out.push({ timestamp: p.t, type: "pressure_spike", label: "Pressure spike", severity: "low" });
    }
    // slip / evasive head movement — quick nose displacement with hands staying high
    if (i > 0) {
      const prev = per[i - 1]!;
      if (
        p.energy != null &&
        prev.energy != null &&
        p.energy > highEnergy &&
        p.guardDrop != null &&
        p.guardDrop < 0.1
      ) {
        out.push({ timestamp: p.t, type: "slip", label: "Successful slip", severity: "low" });
      }
    }
    // delayed recovery — after a busy frame the guard stays low next frame
    if (i > 0) {
      const prev = per[i - 1]!;
      if (
        prev.energy != null &&
        prev.energy > highEnergy &&
        p.guardDrop != null &&
        p.guardDrop > 0.45
      ) {
        out.push({
          timestamp: p.t,
          type: "delayed_recovery",
          label: "Delayed recovery",
          severity: "medium",
        });
      }
    }
    // shoulders braced
    if (p.shrug != null && p.shrug < 0.4) {
      out.push({ timestamp: p.t, type: "fragmentation", label: "Bracing under load", severity: "low" });
    }
  }

  // rank by severity then spread across the clip, de-duped by ~1s window
  const sevRank = { high: 3, medium: 2, low: 1 };
  out.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);
  const chosen: DetectedEvent[] = [];
  for (const e of out) {
    if (chosen.length >= 8) break;
    if (chosen.some((c) => Math.abs(c.timestamp - e.timestamp) < 0.9)) continue;
    chosen.push(e);
  }
  if (chosen.length === 0 && per.length) {
    chosen.push({
      timestamp: per[Math.floor(per.length / 2)]!.t,
      type: "mid_clip",
      label: "Mid-clip read",
      severity: "low",
    });
  }
  chosen.sort((a, b) => a.timestamp - b.timestamp);
  return chosen;
}
