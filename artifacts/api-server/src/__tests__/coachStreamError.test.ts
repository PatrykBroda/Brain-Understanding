import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { classifyCoachStreamError } from "../lib/coachStreamError";

function providerError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("classifyCoachStreamError", () => {
  it("flags an oversized/invalid image as IMAGE_REJECTED", () => {
    const err = providerError(400, "messages.0.content.0.image.source.base64: image exceeds 5 MB maximum");
    expect(classifyCoachStreamError(err).code).toBe("IMAGE_REJECTED");
  });

  it("maps rate limits and overload to AI_BUSY", () => {
    expect(classifyCoachStreamError(providerError(429, "rate limited")).code).toBe("AI_BUSY");
    expect(classifyCoachStreamError(providerError(529, "Overloaded")).code).toBe("AI_BUSY");
  });

  it("maps provider 5xx and connection failures to AI_UNAVAILABLE", () => {
    expect(classifyCoachStreamError(providerError(502, "bad gateway")).code).toBe("AI_UNAVAILABLE");
    expect(classifyCoachStreamError(new Anthropic.APIConnectionError({ message: "fetch failed" })).code).toBe(
      "AI_UNAVAILABLE",
    );
  });

  it("maps timeouts to AI_TIMEOUT", () => {
    expect(classifyCoachStreamError(new Anthropic.APIConnectionTimeoutError()).code).toBe("AI_TIMEOUT");
  });

  it("keeps the consent code", () => {
    const err = Object.assign(new Error("x"), { code: "AI_CONSENT_REQUIRED" });
    expect(classifyCoachStreamError(err).code).toBe("AI_CONSENT_REQUIRED");
  });

  it("never forwards the raw provider message", () => {
    const out = classifyCoachStreamError(providerError(400, "secret internal detail"));
    expect(out.code).toBe("AI_ERROR");
    expect(out.error).not.toContain("secret");
  });
});
