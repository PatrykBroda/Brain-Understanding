// Web counterpart of frame-mobile/lib/imageUpload.ts. The coach page also runs
// inside the app's WebView, where a file picked from the Files app can be HEIC,
// have an empty/odd `file.type`, or be a 20MB original. The API only stores
// JPEG/PNG/WebP/GIF up to 12MB, so such files used to fail with a 415/413 and
// no way forward. Re-encode them to a JPEG in the browser before upload.

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};
export const SOFT_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_EDGE = 2560;

export function declaredImageMime(type: string, name: string): string | null {
  const t = (type || "").split(";")[0]!.trim().toLowerCase();
  const fixed = t === "image/jpg" || t === "image/pjpeg" ? "image/jpeg" : t;
  if (SUPPORTED.has(fixed)) return fixed;
  if (fixed === "" || fixed === "application/octet-stream") {
    const ext = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    return ext ? EXT_MIME[ext] ?? null : null;
  }
  return null;
}

/** True when the file must be re-encoded to JPEG before it can be uploaded. */
export function needsImageConversion(file: { type: string; name: string; size: number }): boolean {
  const mime = declaredImageMime(file.type, file.name);
  if (!mime) return true;
  return mime !== "image/gif" && file.size > SOFT_MAX_BYTES;
}

export function jpegName(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${stem}.jpg`;
}

export class ImageConversionError extends Error {
  constructor() {
    super("Couldn't convert that photo. Try another image or a screenshot of it.");
    this.name = "ImageConversionError";
  }
}

export type PreparedFile = { blob: Blob; mimeType: string; filename: string };

export async function prepareImageFile(file: File): Promise<PreparedFile> {
  if (!needsImageConversion(file)) {
    return { blob: file, mimeType: declaredImageMime(file.type, file.name)!, filename: file.name };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("toBlob returned null");
    return { blob, mimeType: "image/jpeg", filename: jpegName(file.name) };
  } catch {
    throw new ImageConversionError();
  }
}
