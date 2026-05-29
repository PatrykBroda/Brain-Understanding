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
  _landmarker = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  })();
  return _landmarker;
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

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("video seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = t;
  });
}

export async function extractPoseFrames(
  file: File,
  onProgress: (p: ExtractProgress) => void,
): Promise<ExtractResult> {
  onProgress({ stage: "loading", done: 0, total: 1 });
  const landmarker = await loadLandmarker();

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("could not read this video")), {
      once: true,
    });
  });

  const durationRaw = Number.isFinite(video.duration) ? video.duration : MAX_DURATION;
  const duration = Math.min(durationRaw, MAX_DURATION);
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");

  const times: number[] = [];
  for (let t = 0; t < duration && times.length < MAX_FRAMES; t += SAMPLE_INTERVAL) {
    times.push(t);
  }

  const frames: PoseFrame[] = [];
  let monotonic = 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, width, height);
    // VIDEO running mode needs a strictly increasing timestamp in ms.
    monotonic += Math.round(SAMPLE_INTERVAL * 1000);
    let landmarks: Landmark[] | null = null;
    try {
      const result = landmarker.detectForVideo(canvas, monotonic);
      const first = result.landmarks?.[0];
      if (first && first.length >= 33) landmarks = toLandmarks(first);
    } catch {
      landmarks = null;
    }
    frames.push({ timestamp: t, landmarks });
    onProgress({ stage: "extracting", done: i + 1, total: times.length });
  }

  return { frames, durationSec: duration, width, height, video, canvas };
}

export function disposeExtract(result: ExtractResult) {
  const { video, canvas } = result;
  try {
    URL.revokeObjectURL(video.src);
  } catch {
    // ignore
  }
  try {
    // release the decoder: pause, detach source, force a reload to an empty src
    video.pause();
    video.removeAttribute("src");
    video.load();
  } catch {
    // ignore
  }
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
  await seekTo(video, frame.timestamp);
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
