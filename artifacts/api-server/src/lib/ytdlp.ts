import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Best-effort YouTube fetch via yt-dlp. The user accepted that cloud IPs are
// frequently blocked by YouTube and that this is for their OWN footage. On
// autoscale, /tmp is tmpfs (RAM) — so we cap hard: video-only avc1 <=720p (no
// audio means no ffmpeg merge step) and only the first 80s (pose reads 75s).

const YT_MAX_BYTES = 100 * 1024 * 1024;
const YT_TIMEOUT_MS = 90_000;

export class YtDlpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YtDlpError";
  }
}

function friendlyYtMessage(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes("sign in to confirm") || s.includes("not a bot")) {
    return "YouTube blocked this download from the server (bot check). This is expected from cloud servers — download the clip and upload it directly.";
  }
  if (s.includes("private video")) return "That video is private.";
  if (s.includes("age") && s.includes("restrict")) return "That video is age-restricted and can't be fetched.";
  if (s.includes("video unavailable") || s.includes("removed")) return "That video is unavailable or has been removed.";
  if (s.includes("is not a valid url") || s.includes("unsupported url")) return "That doesn't look like a supported YouTube link.";
  return "Couldn't fetch that YouTube video. Cloud servers are often blocked — try downloading it and uploading directly.";
}

// Downloads to a fresh temp dir and returns the produced file path + its dir.
// Caller MUST remove `dir` when done (on response close AND on error).
export async function downloadYouTube(url: string): Promise<{ file: string; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "frame-yt-"));
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--no-part",
    "-f",
    "bestvideo[ext=mp4][vcodec^=avc1][height<=720]/best[ext=mp4][height<=720]/best[height<=720]",
    "--download-sections",
    "*0-80",
    "--force-keyframes-at-cuts",
    "--max-filesize",
    String(YT_MAX_BYTES),
    "--socket-timeout",
    "20",
    "-o",
    path.join(dir, "clip.%(ext)s"),
    url,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "yt-dlp",
        args,
        { timeout: YT_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 },
        (err, _stdout, stderr) => {
          if (err) {
            reject(new YtDlpError(friendlyYtMessage(String(stderr || err.message))));
            return;
          }
          resolve();
        },
      );
    });

    const produced = (await readdir(dir)).filter((f) => f.startsWith("clip."));
    if (produced.length === 0) {
      throw new YtDlpError("YouTube returned no downloadable video (it may be private, restricted, or blocked).");
    }
    return { file: path.join(dir, produced[0]!), dir };
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
