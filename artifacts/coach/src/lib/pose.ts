import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

import { SKELETON_CONNECTIONS } from "./pose-track";
import { selectFighters, type RawPoseFrame } from "./pose-people";
import { playbackRateFor, smoothCost } from "./sampling-rate";

const MP_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type Landmark = { x: number; y: number; z: number; visibility: number };
export type PoseFrame = {
  timestamp: number; // seconds
  landmarks: Landmark[] | null; // 33 BlazePose landmarks, null if no pose locked
};

const MAX_DETECTED_POSES = 4;

let _landmarker: Promise<PoseLandmarker> | null = null;

// Bound the model download + init: on a flaky connection (or a GPU-delegate
// init that hangs instead of throwing) the load can otherwise sit forever and
// the Analyse overlay never leaves "Reading footage · 0%".
const MODEL_LOAD_TIMEOUT_MS = 25_000;

class ModelLoadTimeoutError extends Error {
  constructor() {
    super("movement model load timed out");
    this.name = "ModelLoadTimeoutError";
  }
}

function withModelLoadTimeout(p: Promise<PoseLandmarker>): Promise<PoseLandmarker> {
  return new Promise<PoseLandmarker>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Drop the (possibly hung) cached promise so a retry starts a fresh load
      // instead of awaiting the same stuck one.
      if (_landmarker === p) _landmarker = null;
      reject(new ModelLoadTimeoutError());
    }, MODEL_LOAD_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

let _second: Promise<PoseLandmarker> | null = null;

// MediaPipe's multi-pose finds the most obvious body and often misses the other
// fighter when they overlap or are lit differently. A second, still-image pass on
// the frame with the already-found bodies blanked out recovers most of those.
function loadSecondLandmarker(): Promise<PoseLandmarker> {
  if (_second) return _second;
  const p = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const shared = {
      runningMode: "IMAGE" as const,
      numPoses: 2,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    };
    try {
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        ...shared,
      });
    } catch {
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        ...shared,
      });
    }
  })();
  p.catch(() => {
    if (_second === p) _second = null;
  });
  _second = p;
  return p;
}

function loadLandmarker(): Promise<PoseLandmarker> {
  if (_landmarker) return _landmarker;
  const shared = {
    runningMode: "VIDEO" as const,
    // A fight clip can have a referee / coach / bystanders in frame too: detect a
    // few bodies, then pose-people.ts follows each and picks the two fighters.
    numPoses: MAX_DETECTED_POSES,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  };
  const p = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    try {
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        ...shared,
      });
    } catch {
      // Some mobile GPUs / WebGL-restricted browsers can't init the GPU delegate.
      // Fall back to CPU rather than failing the whole analysis.
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        ...shared,
      });
    }
  })();
  // Never cache a REJECTED promise — one CDN hiccup would otherwise brick every
  // retry for the lifetime of the tab.
  p.catch(() => {
    if (_landmarker === p) _landmarker = null;
  });
  _landmarker = p;
  return p;
}

function bodyBox(lm: Landmark[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let n = 0;
  for (const p of lm) {
    if (p.visibility < 0.3) continue;
    n++;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return n >= 5 ? { x0, y0, x1, y1 } : null;
}

// Same body twice? (box overlap relative to the smaller box)
function sameBody(a: Landmark[], b: Landmark[]): boolean {
  const ba = bodyBox(a);
  const bb = bodyBox(b);
  if (!ba || !bb) return false;
  const iw = Math.min(ba.x1, bb.x1) - Math.max(ba.x0, bb.x0);
  const ih = Math.min(ba.y1, bb.y1) - Math.max(ba.y0, bb.y0);
  if (iw <= 0 || ih <= 0) return false;
  const small = Math.min((ba.x1 - ba.x0) * (ba.y1 - ba.y0), (bb.x1 - bb.x0) * (bb.y1 - bb.y0));
  return small > 0 && (iw * ih) / small > 0.7;
}

// A small clothing-colour fingerprint of a body (torso + upper thigh, mean RGB each,
// -1 = not measurable). The tracker uses it so two fighters in different kit - or a
// fighter and a referee in a black shirt - are never swapped when they cross or clinch.
function patchMean(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  cx: number,
  cy: number,
  half: number,
): [number, number, number] | null {
  const x = Math.max(0, Math.min(cw - 1, Math.round(cx - half)));
  const y = Math.max(0, Math.min(ch - 1, Math.round(cy - half)));
  const w = Math.max(1, Math.min(cw - x, Math.round(half * 2)));
  const h = Math.max(1, Math.min(ch - y, Math.round(half * 2)));
  try {
    const d = ctx.getImageData(x, y, w, h).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n++;
    }
    return n ? [r / n, g / n, b / n] : null;
  } catch {
    return null;
  }
}

export function bodyAppearance(
  lm: Landmark[],
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
): number[] | null {
  const ok = (i: number) => (lm[i]?.visibility ?? 0) >= 0.5;
  if (![11, 12, 23, 24].every(ok)) return null;
  const px = (i: number) => ({ x: lm[i]!.x * cw, y: lm[i]!.y * ch });
  const [s1, s2, h1, h2] = [px(11), px(12), px(23), px(24)] as const;
  const half = Math.max(2, Math.abs(s1.x - s2.x) * 0.2);
  const torso = patchMean(ctx, cw, ch, (s1.x + s2.x + h1.x + h2.x) / 4, (s1.y + s2.y + h1.y + h2.y) / 4, half);
  let thigh: [number, number, number] | null = null;
  const knees = [25, 26].filter(ok).map(px);
  if (knees.length) {
    const hx = (h1.x + h2.x) / 2;
    const hy = (h1.y + h2.y) / 2;
    const kx = knees.reduce((a, k) => a + k.x, 0) / knees.length;
    const ky = knees.reduce((a, k) => a + k.y, 0) / knees.length;
    thigh = patchMean(ctx, cw, ch, hx + (kx - hx) * 0.45, hy + (ky - hy) * 0.45, half);
  }
  if (!torso) return null;
  return [...torso, ...(thigh ?? [-1, -1, -1])].map((v) => Math.round(v));
}

function toLandmarks(raw: NormalizedLandmark[]): Landmark[] {
  return raw.map((l) => ({
    x: l.x,
    y: l.y,
    z: l.z ?? 0,
    visibility: l.visibility ?? 0,
  }));
}

export type ExtractProgress = {
  stage: "loading" | "extracting";
  done: number;
  total: number;
};

export type ExtractResult = {
  /** The suggested athlete (best-tracked person). Equals people[0]. */
  frames: PoseFrame[];
  /** The (at most two) fighters followed through the clip, best-first (0, 1 or 2). Same length as frames. */
  people: PoseFrame[][];
  /** Every pose MediaPipe returned per sampled frame, before tracking (diagnostics / tests). */
  raw: RawPoseFrame[];
  durationSec: number;
  width: number;
  height: number;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
};

const MAX_DURATION = 75; // analyse at most the first 75s
const SAMPLE_INTERVAL = 0.25; // ~4fps sampling
const MAX_FRAMES = 220;
const PLAYBACK_RATE = 1; // start at real time; the rate then follows the measured cost per sample (sampling-rate.ts)
const STALL_MS = 6000; // if media time stops advancing for this long, fail honestly

// requestVideoFrameCallback is missing from older TS DOM libs — declare the shape we use.
type VideoFrameMeta = { mediaTime: number };
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number;
};

// detectForVideo needs a STRICTLY increasing timestamp. The landmarker is a
// module-level singleton reused across analyses, so this counter must persist
// across calls (each new video restarts its own mediaTime at 0).
let _lastTs = 0;

// Resolve when the seek lands, immediately if we're already at the target
// (a same-time seek fires no "seeked" event), or after a timeout — it must
// never hang. Returns true if the frame is ready to draw, false to skip.
function seekTo(video: HTMLVideoElement, t: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.05) {
      resolve(true);
      return;
    }
    let done = false;
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const settle = (ok: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(ok);
    };
    const onSeeked = () => settle(true);
    const onError = () => settle(false);
    const timer = setTimeout(() => settle(false), timeoutMs);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = t;
    } catch {
      settle(false);
    }
  });
}

function teardownVideo(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {
    // ignore
  }
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    // ignore
  }
  try {
    video.remove();
  } catch {
    // ignore
  }
}

// Play-through + requestVideoFrameCallback sampler. This is the ONLY frame path
// iOS Safari reliably decodes: a detached, never-played <video> won't decode
// frames and its "seeked" event can hang forever (the old seek-based loop that
// stalled at ~1% on mobile). We attach the element off-screen, start playback
// inside the file-picker gesture, and sample painted frames as they present.
export type ExtractOptions = {
  /** Look again with the found bodies blanked out (finds the 2nd fighter). Default on. */
  redetect?: boolean;
};

export async function extractPoseFrames(
  file: File,
  onProgress: (p: ExtractProgress) => void,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const redetect = options.redetect ?? true;
  onProgress({ stage: "loading", done: 0, total: 1 });

  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as RVFCVideo;
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute("muted", "");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";
  // Off-screen but still laid out — iOS will not decode a display:none video.
  video.style.cssText =
    "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";

  const metadataReady = new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("could not read this video")), {
      once: true,
    });
  });

  document.body.appendChild(video);
  video.src = url;

  // Kick off playback BEFORE any await so it stays inside the user-gesture task
  // (iOS blocks programmatic play() outside a gesture). Load the model in parallel.
  const playPromise = Promise.resolve(video.play());
  // If an earlier await (metadata) throws first, teardown aborts the load and
  // play() rejects — swallow that here so it can't surface as an unhandled
  // rejection. The explicit `await playPromise` below still reports a genuine
  // play() failure into the honest error path.
  playPromise.catch(() => {});
  const landmarkerPromise = loadLandmarker();
  // Optional: if the second model can't load, we simply skip the extra pass.
  const secondPromise: Promise<PoseLandmarker | null> = redetect ? loadSecondLandmarker().catch(() => null) : Promise.resolve(null);

  try {
    await metadataReady;
  } catch (err) {
    teardownVideo(video);
    URL.revokeObjectURL(url);
    throw err;
  }

  try {
    await playPromise;
  } catch {
    teardownVideo(video);
    URL.revokeObjectURL(url);
    throw new Error(
      "couldn't start video playback on this device — turn off Low Power Mode, or run Analyse on desktop",
    );
  }

  let landmarker: PoseLandmarker;
  try {
    landmarker = await withModelLoadTimeout(landmarkerPromise);
  } catch {
    teardownVideo(video);
    URL.revokeObjectURL(url);
    throw new Error("couldn't load the movement model — check your connection and try again");
  }

  try {
    video.playbackRate = PLAYBACK_RATE;
  } catch {
    // ignore — playback rate is an optimisation, not a requirement
  }

  const durationRaw = Number.isFinite(video.duration) ? video.duration : MAX_DURATION;
  const cap = Math.min(durationRaw, MAX_DURATION);
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;
  // A clip long enough to exceed MAX_FRAMES at 4fps is sampled more sparsely across its WHOLE length
  // (never cut short at MAX_FRAMES while reporting the full duration).
  const interval = Math.max(SAMPLE_INTERVAL, cap / MAX_FRAMES);
  const totalSamples = Math.max(1, Math.min(Math.ceil(cap / interval), MAX_FRAMES));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  let second: PoseLandmarker | null = null;
  try {
    second = await Promise.race([secondPromise, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
  } catch {
    second = null;
  }
  const sscale = Math.min(1, 640 / Math.max(width, height));
  const sw = Math.round(width * sscale);
  const sh = Math.round(height * sscale);
  // `clean` holds the unmodified frame (colour fingerprints are read from it); `scratch` is
  // a copy with the already-found bodies blanked out for the look-again pass.
  const clean = document.createElement("canvas");
  clean.width = sw;
  clean.height = sh;
  const cctx = clean.getContext("2d", { willReadFrequently: true });
  const scratch = document.createElement("canvas");
  scratch.width = sw;
  scratch.height = sh;
  const sctx = second ? scratch.getContext("2d") : null;

  // Detect again with the bodies in `found` painted over; returns only NEW bodies.
  const findMore = (found: Landmark[][]): Landmark[][] => {
    if (!second || !sctx) return [];
    try {
      sctx.drawImage(clean, 0, 0, scratch.width, scratch.height);
      sctx.fillStyle = "rgb(120,120,120)";
      for (const lm of found) {
        const b = bodyBox(lm);
        if (!b) continue;
        const padX = (b.x1 - b.x0) * 0.06;
        const padY = (b.y1 - b.y0) * 0.04;
        sctx.fillRect(
          (b.x0 - padX) * scratch.width,
          (b.y0 - padY) * scratch.height,
          (b.x1 - b.x0 + 2 * padX) * scratch.width,
          (b.y1 - b.y0 + 2 * padY) * scratch.height,
        );
      }
      const res = second.detect(scratch);
      return (res.landmarks ?? []).filter((p) => p.length >= 33).map(toLandmarks);
    } catch {
      return [];
    }
  };

  // Warm up: the first inference initialises the graph and can take seconds. Playback has been
  // running since the file-picker gesture (through the model loads and this warm-up), so do it
  // first and then rewind to the top - otherwise the opening seconds of a clip (all of a short
  // one) pass by unsampled.
  try {
    _lastTs = Math.max(_lastTs + 1, Math.round(video.currentTime * 1000));
    landmarker.detectForVideo(video, _lastTs);
    if (second && cctx) {
      cctx.drawImage(video, 0, 0, sw, sh);
      findMore([]);
    }
  } catch {
    // warm-up is best-effort
  }
  if (video.currentTime > 0.05 || video.ended) {
    await seekTo(video, 0);
    if (video.paused) await Promise.resolve(video.play()).catch(() => {});
  }

  const rawFrames: RawPoseFrame[] = [];
  let nextSampleTime = 0;

  let costMs: number | null = null;
  let appliedRate = PLAYBACK_RATE;
  const sample = (mediaTime: number) => {
    if (rawFrames.length >= totalSamples) return;
    if (mediaTime + 1e-6 < nextSampleTime) return;
    const costStart = performance.now();
    // Only spend a second inference per frame while the sampler is keeping up with the
    // video; on a slow device the extra pass would starve the sampling itself.
    const keepingUp = mediaTime - nextSampleTime <= interval * 0.5;
    // VIDEO running mode needs a strictly increasing timestamp in ms.
    _lastTs = Math.max(_lastTs + 1, Math.round(mediaTime * 1000));
    let poses: Landmark[][] = [];
    try {
      const result = landmarker.detectForVideo(video, _lastTs);
      poses = (result.landmarks ?? []).filter((p) => p.length >= 33).map(toLandmarks);
    } catch {
      poses = [];
    }
    const primary = poses.length;
    if (cctx && poses.length) {
      try {
        cctx.drawImage(video, 0, 0, sw, sh);
      } catch {
        // frame not drawable: no fingerprints for this sample
      }
    }
    // Fewer than 3 bodies found in a fight clip: look again around them.
    if (keepingUp && poses.length >= 1 && poses.length < 3) {
      for (const extra of findMore(poses)) {
        if (poses.length >= MAX_DETECTED_POSES) break;
        // a "new" body that is really a piece of one we already have is not new
        if (!poses.some((q) => sameBody(q, extra))) poses.push(extra);
      }
    }
    const app = cctx && poses.length ? poses.map((lm) => bodyAppearance(lm, cctx, sw, sh)) : undefined;
    rawFrames.push({ timestamp: mediaTime, poses, primary, app });
    onProgress({ stage: "extracting", done: rawFrames.length, total: totalSamples });
    do {
      nextSampleTime += interval;
    } while (nextSampleTime <= mediaTime);
    // Slow device: slow the video so the next slot is not skipped (see sampling-rate.ts).
    costMs = smoothCost(costMs, performance.now() - costStart);
    const want = playbackRateFor(costMs, interval);
    if (Math.abs(want - appliedRate) / appliedRate > 0.15) {
      try {
        video.playbackRate = want;
        appliedRate = want;
      } catch {
        // ignore - rate is an optimisation only
      }
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let lastSeenTime = -1;
      let lastAdvanceWall = performance.now();

      const stop = () => {
        clearInterval(watchdog);
        try {
          video.pause();
        } catch {
          // ignore
        }
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        stop();
        resolve();
      };
      const fail = (err: Error) => {
        if (finished) return;
        finished = true;
        stop();
        reject(err);
      };

      const watchdog = setInterval(() => {
        if (finished) return;
        const mt = video.currentTime;
        if (mt > lastSeenTime + 1e-3) {
          lastSeenTime = mt;
          lastAdvanceWall = performance.now();
        } else if (performance.now() - lastAdvanceWall > STALL_MS) {
          fail(
            new Error(
              "video processing stalled on this device — try a shorter clip or run Analyse on desktop",
            ),
          );
        }
      }, 1000);

      video.addEventListener("ended", () => finish(), { once: true });

      const rvfc = video.requestVideoFrameCallback?.bind(video);
      if (rvfc) {
        const onFrame = (_now: number, meta: VideoFrameMeta) => {
          if (finished) return;
          sample(meta.mediaTime);
          if (meta.mediaTime >= cap - 1e-3 || rawFrames.length >= totalSamples) {
            finish();
            return;
          }
          rvfc(onFrame);
        };
        rvfc(onFrame);
      } else {
        // Fallback for browsers without rVFC (e.g. older Firefox): poll currentTime.
        const onRaf = () => {
          if (finished) return;
          sample(video.currentTime);
          if (video.currentTime >= cap - 1e-3 || rawFrames.length >= totalSamples || video.ended) {
            finish();
            return;
          }
          requestAnimationFrame(onRaf);
        };
        requestAnimationFrame(onRaf);
      }
    });
  } catch (err) {
    teardownVideo(video);
    URL.revokeObjectURL(url);
    throw err;
  }

  const people = selectFighters(rawFrames, width, height);
  // No pose anywhere -> keep the frame timeline with empty poses (same as before).
  const frames: PoseFrame[] = people[0] ?? rawFrames.map((f) => ({ timestamp: f.timestamp, landmarks: null }));
  return { frames, people, raw: rawFrames, durationSec: cap, width, height, video, canvas };
}

export function disposeExtract(result: ExtractResult) {
  const { video, canvas } = result;
  try {
    URL.revokeObjectURL(video.src);
  } catch {
    // ignore
  }
  teardownVideo(video);
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore
  }
}

// Capture a JPEG of the video at a given time, optionally drawing the skeleton overlay.
export async function captureKeyframe(
  result: ExtractResult,
  frame: PoseFrame,
  maxEdge = 520,
  // Two-person clips: "you" in blue and the opponent in red, same as the player.
  people?: { youColor: string; opponent: Landmark[] | null; opponentColor: string },
): Promise<string> {
  const { video } = result;
  const ok = await seekTo(video, frame.timestamp);
  if (!ok) return ""; // couldn't land the seek — skip this keyframe (caller tolerates it)
  const scale = Math.min(1, maxEdge / Math.max(result.width, result.height));
  const w = Math.round(result.width * scale);
  const h = Math.round(result.height * scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(video, 0, 0, w, h);
  if (people?.opponent) drawSkeleton(ctx, people.opponent, w, h, people.opponentColor);
  if (frame.landmarks) drawSkeleton(ctx, frame.landmarks, w, h, people?.youColor);
  return out.toDataURL("image/jpeg", 0.72);
}

const CONNECTIONS = SKELETON_CONNECTIONS;

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  color = "rgba(214, 160, 90, 0.95)",
) {
  ctx.lineWidth = Math.max(1.5, w / 320);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [a, b] of CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb || la.visibility < 0.3 || lb.visibility < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(la.x * w, la.y * h);
    ctx.lineTo(lb.x * w, lb.y * h);
    ctx.stroke();
  }
  const r = Math.max(2, w / 200);
  for (const lm of landmarks) {
    if (lm.visibility < 0.3) continue;
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
