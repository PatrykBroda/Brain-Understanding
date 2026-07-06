import { describe, it, expect } from "vitest";
import {
  ipIsBlocked,
  classifySource,
  normalizeForFetch,
  type RemoteSource,
} from "../lib/remoteFetch";

describe("ipIsBlocked — must reject internal / reserved addresses", () => {
  const blocked = [
    // IPv4 private / loopback / link-local / reserved
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.5",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "169.254.0.1",
    "100.64.0.1", // CGNAT
    "100.127.255.255",
    "0.0.0.0",
    "0.1.2.3",
    "192.0.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1", // multicast
    "239.255.255.255",
    "240.0.0.1", // reserved
    "255.255.255.255", // broadcast
    // IPv6 loopback / unspecified / ULA / link-local / multicast
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    // IPv4-mapped IPv6 pointing at internal v4
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    // NAT64 wrapping an internal v4
    "64:ff9b::127.0.0.1",
    "64:ff9b::a00:1", // == 10.0.0.1
    // garbage
    "not-an-ip",
    "999.999.999.999",
  ];

  for (const ip of blocked) {
    it(`blocks ${ip}`, () => {
      expect(ipIsBlocked(ip)).toBe(true);
    });
  }
});

describe("ipIsBlocked — must allow public addresses", () => {
  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "142.250.72.206", // google
    "13.107.42.14",
    "2606:4700:4700::1111", // cloudflare v6
    "2001:4860:4860::8888", // google v6
    "::ffff:8.8.8.8", // mapped public v4
  ];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => {
      expect(ipIsBlocked(ip)).toBe(false);
    });
  }
});

describe("classifySource", () => {
  const cases: [string, RemoteSource][] = [
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://m.youtube.com/watch?v=abc", "youtube"],
    ["https://www.youtube-nocookie.com/embed/abc", "youtube"],
    ["https://drive.google.com/file/d/XYZ/view", "drive"],
    ["https://docs.google.com/uc?id=XYZ", "drive"],
    ["https://www.dropbox.com/s/xyz/clip.mp4?dl=0", "dropbox"],
    // dropboxusercontent.com is already the direct-download CDN host — fetched as-is.
    ["https://dl.dropboxusercontent.com/s/xyz/clip.mp4", "direct"],
    ["https://example.com/clip.mp4", "direct"],
  ];
  for (const [url, expected] of cases) {
    it(`${url} → ${expected}`, () => {
      expect(classifySource(new URL(url))).toBe(expected);
    });
  }
});

describe("normalizeForFetch", () => {
  it("turns a Drive /file/d/ link into a uc?export=download URL", () => {
    const u = new URL("https://drive.google.com/file/d/ABC123/view?usp=sharing");
    const out = normalizeForFetch(u, "drive");
    expect(out?.toString()).toBe("https://drive.google.com/uc?export=download&id=ABC123");
  });

  it("turns a Drive open?id= link into a uc?export=download URL", () => {
    const u = new URL("https://drive.google.com/open?id=ABC123");
    const out = normalizeForFetch(u, "drive");
    expect(out?.toString()).toBe("https://drive.google.com/uc?export=download&id=ABC123");
  });

  it("returns null for a Drive link with no file id", () => {
    const u = new URL("https://drive.google.com/drive/my-drive");
    expect(normalizeForFetch(u, "drive")).toBeNull();
  });

  it("forces dl=1 on a Dropbox link", () => {
    const u = new URL("https://www.dropbox.com/s/xyz/clip.mp4?dl=0");
    const out = normalizeForFetch(u, "dropbox");
    expect(out?.searchParams.get("dl")).toBe("1");
  });

  it("passes a direct link through unchanged", () => {
    const u = new URL("https://example.com/clip.mp4");
    expect(normalizeForFetch(u, "direct")?.toString()).toBe("https://example.com/clip.mp4");
  });

  it("returns null for youtube (handled by the yt-dlp runner)", () => {
    const u = new URL("https://youtu.be/abc");
    expect(normalizeForFetch(u, "youtube")).toBeNull();
  });
});
