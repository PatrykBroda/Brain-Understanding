import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";

// safeStream's SSRF defence for hostnames is the custom `lookup` option — but
// Node SKIPS `lookup` when the host is already an IP literal (net.lookupAndConnect
// short-circuits on isIP). So safeStream must reject IP-literal hosts itself,
// on every redirect hop. These tests exercise that enforcement path (the
// remoteFetch.test.ts suite only tests ipIsBlocked in isolation). node:https is
// mocked so no real network is touched and redirects can be scripted.

const h = vi.hoisted(() => ({
  hops: [] as { status: number; location?: string; contentType?: string }[],
  calls: 0,
}));

vi.mock("node:https", () => ({
  request: (_url: unknown, _opts: unknown, cb: (res: unknown) => void) => {
    const hop = h.hops[h.calls] ?? { status: 200, contentType: "video/mp4" };
    h.calls++;
    const res = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
      resume: () => void;
    };
    res.statusCode = hop.status;
    res.headers = {};
    if (hop.location) res.headers.location = hop.location;
    if (hop.contentType) res.headers["content-type"] = hop.contentType;
    res.resume = () => {};
    queueMicrotask(() => cb(res));
    const req = new EventEmitter() as EventEmitter & {
      setTimeout: () => unknown;
      end: () => void;
      destroy: () => void;
    };
    req.setTimeout = () => req;
    req.end = () => {};
    req.destroy = () => {};
    return req;
  },
}));

const { safeStream, RemoteFetchError } = await import("../lib/remoteFetch");

beforeEach(() => {
  h.hops = [];
  h.calls = 0;
});

describe("safeStream — IP-literal SSRF enforcement", () => {
  it("rejects a direct loopback IPv4 literal before any request", async () => {
    await expect(safeStream(new URL("https://127.0.0.1/x.mp4"))).rejects.toBeInstanceOf(RemoteFetchError);
    expect(h.calls).toBe(0);
  });

  it("rejects a direct private IPv4 literal", async () => {
    await expect(safeStream(new URL("https://10.0.0.5/x.mp4"))).rejects.toBeInstanceOf(RemoteFetchError);
    expect(h.calls).toBe(0);
  });

  it("rejects the cloud metadata IP literal", async () => {
    await expect(safeStream(new URL("https://169.254.169.254/latest/meta-data/"))).rejects.toBeInstanceOf(
      RemoteFetchError,
    );
    expect(h.calls).toBe(0);
  });

  it("rejects a bracketed IPv6 loopback literal", async () => {
    await expect(safeStream(new URL("https://[::1]/x.mp4"))).rejects.toBeInstanceOf(RemoteFetchError);
    expect(h.calls).toBe(0);
  });

  it("rejects a public host that redirects to an IP literal (per-hop enforcement)", async () => {
    h.hops = [{ status: 302, location: "https://10.0.0.5/evil.mp4" }];
    await expect(safeStream(new URL("https://videos.example.com/clip.mp4"))).rejects.toBeInstanceOf(
      RemoteFetchError,
    );
    // first hop went out; second hop blocked BEFORE a request was made
    expect(h.calls).toBe(1);
  });

  it("does not over-block: a public host returning 200 succeeds", async () => {
    h.hops = [{ status: 200, contentType: "video/mp4" }];
    const { res, finalUrl } = await safeStream(new URL("https://videos.example.com/clip.mp4"));
    expect((res as { statusCode: number }).statusCode).toBe(200);
    expect(finalUrl.hostname).toBe("videos.example.com");
    expect(h.calls).toBe(1);
  });

  it("follows a public→public redirect and returns the final 200", async () => {
    h.hops = [
      { status: 302, location: "https://cdn.example.com/real.mp4" },
      { status: 200, contentType: "video/mp4" },
    ];
    const { finalUrl } = await safeStream(new URL("https://videos.example.com/clip.mp4"));
    expect(finalUrl.hostname).toBe("cdn.example.com");
    expect(h.calls).toBe(2);
  });
});
