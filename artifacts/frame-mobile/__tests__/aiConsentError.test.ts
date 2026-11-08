import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));

import { ApiError } from "../lib/api";
import { aiConsentLoadErrorCopy } from "../lib/aiConsentError";

describe("AI consent load error copy", () => {
  it("directs expired sessions to sign in again", () => {
    expect(aiConsentLoadErrorCopy(new ApiError(401, "Unauthorized"))).toEqual({
      title: "Session expired",
      message: "Please sign in again to load your permissions.",
      action: "sign-in",
    });
  });

  it("identifies server failures instead of calling them connection errors", () => {
    expect(aiConsentLoadErrorCopy(new ApiError(500, "Internal error"))).toEqual({
      title: "FRAME is temporarily unavailable",
      message: "We couldn’t verify your permissions. Please try again shortly.",
      action: "retry",
    });
  });

  it("keeps transport errors actionable", () => {
    expect(
      aiConsentLoadErrorCopy(new TypeError("Network request failed")),
    ).toEqual({
      title: "Connection problem",
      message: "Could not reach FRAME. Check your connection and try again.",
      action: "retry",
    });
  });

  it("does not imply a transient server outage for other HTTP errors", () => {
    expect(aiConsentLoadErrorCopy(new ApiError(403, "Forbidden")).title).toBe(
      "Could not verify permissions",
    );
  });
});
