const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function mimeFromFilename(filename?: string | null): string | null {
  const extension = filename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] ?? null : null;
}

export function supportedImageMime(
  mimeType?: string | null,
  filename?: string | null,
): string | null {
  const declared = mimeType?.split(";")[0]?.trim().toLowerCase();
  const candidate = declared || mimeFromFilename(filename);
  return candidate && SUPPORTED_IMAGE_MIME_TYPES.has(candidate) ? candidate : null;
}

export function filenameForImageMime(
  filename: string | null | undefined,
  mimeType: string,
): string {
  const extension = IMAGE_EXTENSIONS[mimeType] ?? ".jpg";
  const original = filename?.trim() || "image";
  const stem = original.replace(/\.[^./\\]+$/, "") || "image";
  return `${stem}${extension}`;
}
