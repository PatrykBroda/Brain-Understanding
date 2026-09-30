import { describe, expect, it } from "vitest";
import { normaliseDomain, resolveApiBase, resolveCrashUrl } from "../lib/appDomain";

describe("normaliseDomain", () => {
  it("strips protocol, trailing slashes and whitespace", () => {
    expect(normaliseDomain("  https://frame.example.com/  ")).toBe("frame.example.com");
    expect(normaliseDomain("http://frame.example.com")).toBe("frame.example.com");
    expect(normaliseDomain("frame.example.com")).toBe("frame.example.com");
  });

  it("treats an unprovisioned variable as empty", () => {
    expect(normaliseDomain(undefined)).toBe("");
    expect(normaliseDomain(null)).toBe("");
    expect(normaliseDomain("")).toBe("");
    expect(normaliseDomain("   ")).toBe("");
  });
});

describe("resolveApiBase", () => {
  it("prefers the window origin on web", () => {
    expect(
      resolveApiBase({ domain: "frame.example.com", windowOrigin: "https://web.example.com" })
    ).toBe("https://web.example.com/api");
  });

  it("builds from the domain on native", () => {
    expect(resolveApiBase({ domain: "frame.example.com", windowOrigin: null })).toBe(
      "https://frame.example.com/api"
    );
  });

  // The whole point of the module: an unprovisioned EXPO_PUBLIC_DOMAIN must not
  // degrade into relative-path requests, because that renders a priceless
  // paywall and dead Privacy/Terms links with no error anywhere.
  it("returns null rather than an empty base when the domain is missing", () => {
    expect(resolveApiBase({ domain: "", windowOrigin: null })).toBeNull();
    expect(resolveApiBase({ domain: undefined })).toBeNull();
  });
});

describe("resolveCrashUrl", () => {
  it("builds the crash endpoint from the domain", () => {
    expect(resolveCrashUrl("frame.example.com")).toBe("https://frame.example.com/api/crash-log");
  });

  it("returns null with no domain, so nothing is posted to a guessed host", () => {
    expect(resolveCrashUrl("")).toBeNull();
    expect(resolveCrashUrl(undefined)).toBeNull();
  });
});
