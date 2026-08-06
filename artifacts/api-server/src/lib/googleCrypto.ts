import crypto from "node:crypto";

// ── Token encryption at rest ────────────────────────────────────────────────
// AES-256-GCM. The key is derived from APP_ENCRYPTION_KEY via SHA-256 so any
// key length/encoding (e.g. `openssl rand -base64 32`) normalises to 32 bytes.
// A DEDICATED secret (not SESSION_SECRET) so rotating the session secret can
// never silently destroy every stored refresh token.

function keyFrom(material: string): Buffer {
  return crypto.createHash("sha256").update(material, "utf8").digest();
}

export function encryptWithKey(plaintext: string, material: string): string {
  const key = keyFrom(material);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptWithKey(payload: string, material: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed ciphertext");
  const key = keyFrom(material);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function appKey(): string {
  const k = process.env["APP_ENCRYPTION_KEY"];
  if (!k) throw new Error("APP_ENCRYPTION_KEY not configured");
  return k;
}

export function encrypt(plaintext: string): string {
  return encryptWithKey(plaintext, appKey());
}

export function decrypt(payload: string): string {
  return decryptWithKey(payload, appKey());
}

// ── OAuth `state`: signed identity carrier ──────────────────────────────────
// The public callback has no session cookie, so identity travels inside an
// HMAC-signed state (SESSION_SECRET). Format: `<payloadB64url>.<sigB64url>`,
// payload = { u: userId, n: nonce, e: expiryMs }. Verify is timing-safe.

const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export type StatePayload = { u: string; n: string; e: number };

export function signStateWithSecret(payload: StatePayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyStateWithSecret(
  state: string,
  secret: string,
  now: number = Date.now(),
): StatePayload | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.u !== "string" ||
    typeof payload?.n !== "string" ||
    typeof payload?.e !== "number"
  ) {
    return null;
  }
  if (payload.e < now) return null;
  return payload;
}

function sessionSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET not configured");
  return s;
}

const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(userId: string): { state: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  const state = signStateWithSecret(
    { u: userId, n: crypto.randomBytes(16).toString("hex"), e: expiresAt.getTime() },
    sessionSecret(),
  );
  return { state, expiresAt };
}

export function verifyState(state: string): StatePayload | null {
  return verifyStateWithSecret(state, sessionSecret());
}
