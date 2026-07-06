import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

const MP_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type Landmark = { x: number; y: number; z: number; visibility: number };
export type PoseFrame = {
  timestamp: number; // seconds
  landmarks: Landmark[] | null; // 33 BlazePose landmarks, null if no pose locked
};

let _landmarker: Promise<PoseLandmarker> | null = null;

function loadLandmarker(): Promise<PoseLandmarker> {
  if (_landmarker) return _landmarker;
  const shared = {
    runningMode: "VIDEO" as const,
    numPoses: 1,
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
  frames: PoseFrame[];
  durationSec: number;
  width: number;
  height: number;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
};

const MAX_DURATION = 75; // analyse at most the first 75s
const SAMPLE_INTERVAL = 0.25; // ~4fps sampling
const MAX_FRAMES = 220;
const PLAYBACK_RATE = 2; // play-through at 2x to keep processing time sane (keep <= 2)
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
export async function extractPoseFrames(
  file: File,
  onProgress: (p: ExtractProgress) => void,
): Promise<ExtractResult> {
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
    landmarker = await landmarkerPromise;
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
  const totalSamples = Math.max(1, Math.min(Math.ceil(cap / SAMPLE_INTERVAL), MAX_FRAMES));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const frames: PoseFrame[] = [];
  let nextSampleTime = 0;

  const sample = (mediaTime: number) => {
    if (frames.length >= totalSamples) return;
    if (mediaTime + 1e-6 < nextSampleTime) return;
    // VIDEO running mode needs a strictly increasing timestamp in ms.
    _lastTs = Math.max(_lastTs + 1, Math.round(mediaTime * 1000));
    let landmarks: Landmark[] | null = null;
    try {
      const result = landmarker.detectForVideo(video, _lastTs);
      const first = result.landmarks?.[0];
      if (first && first.length >= 33) landmarks = toLandmarks(first);
    } catch {
      landmarks = null;
    }
    frames.push({ timestamp: mediaTime, landmarks });
    onProgress({ stage: "extracting", done: frames.length, total: totalSamples });
    do {
      nextSampleTime += SAMPLE_INTERVAL;
    } while (nextSampleTime <= mediaTime);
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
          if (meta.mediaTime >= cap - 1e-3 || frames.length >= totalSamples) {
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
          if (video.currentTime >= cap - 1e-3 || frames.length >= totalSamples || video.ended) {
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

  return { frames, durationSec: cap, width, height, video, canvas };
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
  if (frame.landmarks) drawSkeleton(ctx, frame.landmarks, w, h);
  return out.toDataURL("image/jpeg", 0.72);
}

// BlazePose connection pairs (subset that reads cleanly for combat sports).
const CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
];

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
