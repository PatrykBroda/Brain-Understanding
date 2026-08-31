import { fetch } from "expo/fetch";

let _base = "";
let _getToken: (() => Promise<string | null>) | null = null;

export function setApiBase(url: string) {
  _base = url;
}

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

/** Return the current auth token without side-effects — used by Image headers. */
export async function getAuthToken(): Promise<string | null> {
  return _getToken ? _getToken() : null;
}

async function authHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const token = _getToken ? await _getToken() : null;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// Athlete hero image, served by the API and cache-busted with the fighter's
// updatedAt so a fresh upload shows immediately (mirrors the web dashboard).
export function heroFileUrl(cacheKey: string | number): string {
  return `${_base}/fighter/hero/file?v=${encodeURIComponent(String(cacheKey))}`;
}

// Athlete hero/cover image upload. Mirrors the web client: the server takes a
// base64 payload (not multipart), so expo-image-picker's base64 output goes
// straight through. Returns the updated fighter row.
export async function uploadHero<T>(payload: {
  mimeType: string;
  filename: string;
  dataBase64: string;
}): Promise<T> {
  return apiPost<T>("/fighter/hero", payload);
}

export async function removeHero<T>(): Promise<T> {
  return apiDelete<T>("/fighter/hero");
}

// Chat attachment (image/video) sent alongside a coach message. Mirrors the
// web client: the server takes a base64 payload (not multipart) and returns the
// stored row. The file is then served by id, cache-friendly, no auth header.
export type AttachmentDto = {
  id: number;
  kind: "image" | "video";
  mimeType: string;
  filename: string;
  sizeBytes: number;
};

export function attachmentFileUrl(id: number): string {
  return `${_base}/attachments/${id}/file`;
}

export async function uploadAttachment(payload: {
  conversationId: number;
  kind: "image" | "video";
  mimeType: string;
  filename: string;
  dataBase64: string;
}): Promise<AttachmentDto> {
  const res = await apiPost<{ attachment: AttachmentDto }>("/attachments", payload);
  return res.attachment;
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${_base}${path}`, { headers });
  if (!res.ok) {
    throw await responseError(res);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${_base}${path}`, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw await responseError(res);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${_base}${path}`, {
    method: "PATCH",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw await responseError(res);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${_base}${path}`, { method: "DELETE", headers });
  if (!res.ok) {
    throw await responseError(res);
  }
  return res.json() as Promise<T>;
}

export type SSEChunk =
  | { content: string; done?: never; error?: never }
  | { done: true; content?: never; error?: never }
  | { error: string; content?: never; done?: never };

// Carries the HTTP status (and server error `code`, e.g. "FRAME_PLUS_REQUIRED")
// so a streaming caller can tell a real transport failure apart from an
// actionable HTTP response like a 402 free-tier gate.
export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;
  constructor(
    status: number,
    message: string,
    code?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function responseError(res: Response): Promise<ApiError> {
  const raw = await res.text().catch(() => "");
  let message = "";
  let code: string | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; code?: unknown };
      if (typeof parsed.error === "string") message = parsed.error;
      if (typeof parsed.code === "string") code = parsed.code;
    } catch {
      // Non-JSON responses are handled by the status-specific UI message.
    }
  }
  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfterSeconds = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : undefined;
  return new ApiError(
    res.status,
    message || `Request failed with status ${res.status}.`,
    code,
    Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
  );
}

export async function apiStream(
  path: string,
  body: unknown,
  onChunk: (chunk: SSEChunk) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers = await authHeaders({ Accept: "text/event-stream" });
  const res = await fetch(`${_base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    // Prefer the server's JSON `{ error, code }` shape; fall back to raw text.
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    const raw = await res.text().catch(() => "");
    if (raw) {
      message = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: unknown; code?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
        if (typeof parsed.code === "string") code = parsed.code;
      } catch {
        // non-JSON error body — keep the raw text
      }
    }
    throw new ApiError(res.status, message, code);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as SSEChunk;
        onChunk(parsed);
      } catch {
        // ignore malformed
      }
    }
  }
}
