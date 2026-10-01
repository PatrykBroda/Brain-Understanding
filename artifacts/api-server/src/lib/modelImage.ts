import { spawn } from "node:child_process";

// Chat images go to the model as inline base64. Anthropic rejects any image over
// 5MB (or >8000px a side) and the whole turn fails with "Something broke" on
// mobile — a full-res phone photo (upload cap is 12MB) trips that every time.
// The model downsamples anything past ~1568px on the long edge anyway, so we
// shrink to that before sending: no quality loss to the coach, and every photo
// fits. ffmpeg is already in the deploy image (replit.nix), so no native dep.

export const MODEL_IMAGE_MAX_EDGE = 1568;
// Anything this small is already within the model's limits — pass it through.
const PASSTHROUGH_MAX_BYTES = 1.5 * 1024 * 1024;
// Raw-byte ceiling that keeps the base64 payload under Anthropic's 5MB cap.
export const MODEL_IMAGE_MAX_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4) - 1024;
const FFMPEG_TIMEOUT_MS = 20_000;

export type ModelImage = { data: Buffer; mimeType: string };

function shrinkWithFfmpeg(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.env["FFMPEG_PATH"] || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:0",
        "-vf",
        `scale='min(${MODEL_IMAGE_MAX_EDGE},iw)':'min(${MODEL_IMAGE_MAX_EDGE},ih)':force_original_aspect_ratio=decrease`,
        "-frames:v", "1",
        "-q:v", "3",
        "-f", "image2pipe",
        "-c:v", "mjpeg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => (err += c.toString()));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(out);
      if (code === 0 && buf.length > 0) resolve(buf);
      else reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(0, 300)}`));
    });
    // Ignore EPIPE if ffmpeg bails before reading all of stdin; close handles it.
    proc.stdin.on("error", () => {});
    proc.stdin.end(input);
  });
}

/**
 * Returns image bytes safe to inline for the model, or null if the image can't
 * be made to fit (caller should fall back to a text placeholder instead of
 * failing the whole turn).
 */
export async function prepareImageForModel(
  buf: Buffer,
  mimeType: string,
): Promise<ModelImage | null> {
  if (buf.length <= PASSTHROUGH_MAX_BYTES) return { data: buf, mimeType };
  try {
    const shrunk = await shrinkWithFfmpeg(buf);
    if (shrunk.length <= MODEL_IMAGE_MAX_BYTES) return { data: shrunk, mimeType: "image/jpeg" };
  } catch {
    // fall through — original may still be under the hard cap
  }
  return buf.length <= MODEL_IMAGE_MAX_BYTES ? { data: buf, mimeType } : null;
}
