// Decide the real type of an uploaded image/video from its bytes.
//
// Clients declare a mime type, but it is often wrong or missing: iOS reports
// "image/jpg", WebViews send "" or "application/octet-stream" for files picked
// from the Files app, Android pickers say "image/*". The old check compared the
// declared string to an allow-list and answered 415, so a perfectly good JPEG
// was rejected. Trust the magic bytes first, the declared type second.

export type UploadKind = "image" | "video";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "video/mov": "video/quicktime",
  "video/x-m4v": "video/mp4",
  "video/m4v": "video/mp4",
};

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function cleanMime(declared: string): string {
  const base = declared.split(";")[0]!.trim().toLowerCase();
  return ALIASES[base] ?? base;
}

/** "heic" when the bytes are an HEIC/HEIF image (not decodable by the model). */
export type SniffResult = string | "heic" | null;

export function sniffMime(b: Buffer): SniffResult {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (b.length >= 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a"))
    return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length >= 12 && b.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = b.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

export type ResolvedUpload =
  | { ok: true; mime: string }
  | { ok: false; reason: "heic" | "unsupported"; detail: string };

/**
 * Resolve the stored mime type. Bytes win when they identify a supported type
 * of the requested kind; otherwise a declared (or filename-derived) allow-listed
 * type is accepted as before, so nothing that worked yesterday is rejected.
 */
export function resolveUploadMime(
  kind: UploadKind,
  declared: string,
  filename: string,
  bytes: Buffer,
): ResolvedUpload {
  const allowed = kind === "image" ? IMAGE_MIMES : VIDEO_MIMES;
  const sniffed = sniffMime(bytes);
  if (sniffed === "heic") {
    return { ok: false, reason: "heic", detail: "HEIC/HEIF photos are not supported; send a JPEG or PNG" };
  }
  if (sniffed && allowed.has(sniffed)) return { ok: true, mime: sniffed };
  // Recognisable bytes of the wrong kind (an mp4 sent as an image): reject.
  if (sniffed) return { ok: false, reason: "unsupported", detail: `unsupported ${kind} content (${sniffed})` };
  const d = cleanMime(declared);
  if (allowed.has(d)) return { ok: true, mime: d };
  {
    const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    const fromExt = ext ? EXT_MIME[ext] : undefined;
    // Only trust the extension when the declared type is absent/generic.
    const generic = d === "" || d === "application/octet-stream" || d.endsWith("/*");
    if (generic && fromExt && allowed.has(fromExt)) return { ok: true, mime: fromExt };
  }
  return { ok: false, reason: "unsupported", detail: `unsupported ${kind} mime: ${declared}` };
}
