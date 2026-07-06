import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";

// Video fetched server-side is streamed straight back to the browser, where the
// EXISTING on-device MediaPipe pose pass runs. So the only job here is: turn a
// pasted link into raw video bytes, safely. SSRF is the one serious surface —
// the endpoint is authed-only, but an authed user must not be able to make the
// server reach internal/metadata addresses.

export type RemoteSource = "youtube" | "drive" | "dropbox" | "direct";

// Aligns with the client MAX_VIDEO_BYTES (250MB). We keep a little headroom
// below that so a fetched clip never trips the client-side size guard.
export const MAX_REMOTE_BYTES = 220 * 1024 * 1024;

// User-facing failure — mapped to HTTP 422 with the message surfaced verbatim.
export class RemoteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteFetchError";
  }
}

// ---------------------------------------------------------------------------
// IP range blocking (applied to RESOLVED addresses, never hostname strings, so
// decimal/octal/hex host encodings are neutralised automatically).
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (incl 169.254.169.254 metadata)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved (incl 255.255.255.255 broadcast)
];

function inCidr4(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (b & mask);
}

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return V4_BLOCKS.some(([b, bits]) => inCidr4(n, b, bits));
}

// Expand any IPv6 form (incl :: compression + trailing embedded IPv4) to 8 hextets.
function expandV6(addr: string): number[] | null {
  const dbl = addr.split("::");
  if (dbl.length > 2) return null;

  const toHextets = (segment: string): number[] | null => {
    if (segment === "") return [];
    const out: number[] = [];
    for (const g of segment.split(":")) {
      if (g.includes(".")) {
        const v4 = ipv4ToInt(g);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };

  const head = toHextets(dbl[0]!);
  const tail = dbl.length === 2 ? toHextets(dbl[1]!) : [];
  if (!head || !tail) return null;

  if (dbl.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    return [...head, ...Array<number>(missing).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}

function isBlockedV6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]!;
  const h = expandV6(addr);
  if (!h) return true;

  // IPv4-mapped ::ffff:a.b.c.d — re-check the embedded v4.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    return isBlockedV4(`${(h[6]! >> 8) & 0xff}.${h[6]! & 0xff}.${(h[7]! >> 8) & 0xff}.${h[7]! & 0xff}`);
  }
  // NAT64 64:ff9b::/96 — re-check the embedded v4.
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return isBlockedV4(`${(h[6]! >> 8) & 0xff}.${h[6]! & 0xff}.${(h[7]! >> 8) & 0xff}.${h[7]! & 0xff}`);
  }

  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  const first = h[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function ipIsBlocked(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedV4(ip);
  if (fam === 6) return isBlockedV6(ip);
  return true; // not a valid IP literal → block
}

// ---------------------------------------------------------------------------
// Source classification + normalisation to a direct-download URL.
// ---------------------------------------------------------------------------

export function classifySource(u: URL): RemoteSource {
  const host = u.hostname.toLowerCase();
  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  ) {
    return "youtube";
  }
  if (host === "drive.google.com" || host === "docs.google.com") return "drive";
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) return "dropbox";
  return "direct";
}

function driveDirect(u: URL): URL | null {
  let id: string | null = null;
  const m = u.pathname.match(/\/(?:file\/d|d)\/([^/]+)/);
  if (m) id = m[1]!;
  else id = u.searchParams.get("id");
  if (!id) return null;
  return new URL(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`);
}

function dropboxDirect(u: URL): URL {
  const copy = new URL(u.toString());
  copy.searchParams.set("dl", "1");
  return copy;
}

// Returns the URL to fetch bytes from, or null if it can't be turned into one.
export function normalizeForFetch(u: URL, source: RemoteSource): URL | null {
  if (source === "drive") return driveDirect(u);
  if (source === "dropbox") return dropboxDirect(u);
  if (source === "direct") return u;
  return null; // youtube is handled by the yt-dlp runner, not here
}

// ---------------------------------------------------------------------------
// Connect-time-validated fetch. The custom `lookup` validates every resolved
// address BEFORE the socket connects and is re-applied on each manual redirect
// hop — this closes DNS-rebinding (pre-flight dns.lookup alone is TOCTOU-racey).
// ---------------------------------------------------------------------------

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;

function safeLookup(hostname: string, options: unknown, callback: LookupCallback): void {
  const opts = (typeof options === "object" && options !== null ? options : {}) as {
    family?: number;
    all?: boolean;
    hints?: number;
  };
  dnsLookup(hostname, { all: true, family: opts.family ?? 0, hints: opts.hints ?? 0 }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    for (const a of addresses) {
      if (ipIsBlocked(a.address)) {
        callback(new Error(`SSRF blocked: ${hostname} resolves to disallowed address`) as NodeJS.ErrnoException);
        return;
      }
    }
    if (opts.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  });
}

const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 20_000;

// Follows redirects (validating each hop) and resolves with the final 200 response
// stream. Caller is responsible for consuming/destroying the stream.
export async function safeStream(startUrl: URL): Promise<{ res: IncomingMessage; finalUrl: URL }> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:") {
      throw new RemoteFetchError("Only https video links are supported.");
    }
    if (url.username || url.password) {
      throw new RemoteFetchError("Links with embedded credentials are not allowed.");
    }
    // Node's `lookup` option is SKIPPED when the hostname is already an IP
    // literal (net.lookupAndConnect short-circuits on isIP), so safeLookup would
    // never see it. Validate IP-literal hosts here — inside the loop, so it also
    // covers a public host that redirects to an IP-literal URL.
    const bareHost = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(bareHost) && ipIsBlocked(bareHost)) {
      throw new RemoteFetchError("That link resolves to a disallowed address.");
    }

    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = httpsRequest(
        url,
        {
          method: "GET",
          lookup: safeLookup as never,
          headers: {
            "user-agent": "Mozilla/5.0 (compatible; FRAME-Analyse/1.0)",
            accept: "*/*",
          },
        },
        resolve,
      );
      req.setTimeout(CONNECT_TIMEOUT_MS, () => req.destroy(new Error("Upstream connection timed out")));
      req.on("error", reject);
      req.end();
    });

    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume(); // drain so the socket can be reused/freed
      url = new URL(res.headers.location, url);
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new RemoteFetchError(`The link responded with status ${status}.`);
    }
    return { res, finalUrl: url };
  }
  throw new RemoteFetchError("The link redirected too many times.");
}
