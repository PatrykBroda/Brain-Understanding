import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "../lib/authErrors";
import { AuthSessionError } from "../lib/authSession";

function apiError(
  status: number,
  message: string,
  retryAfterSeconds?: number,
): Error & { status: number; retryAfterSeconds?: number } {
  return Object.assign(new Error(message), { status, retryAfterSeconds });
}

describe("getAuthErrorMessage", () => {
  it("explains the signup rate limit and wait time", () => {
    expect(
      getAuthErrorMessage(
        apiError(429, "Too many requests. Try again later.", 900),
        "sign-up",
      ),
    ).toBe(
      "Too many attempts at creating an account. Please wait about 15 minutes, then try again.",
    );
  });

  it("turns duplicate signup into a sign-in suggestion", () => {
    expect(
      getAuthErrorMessage(
        apiError(409, "An account with that email already exists"),
        "sign-up",
      ),
    ).toBe("An account with that email already exists. Try signing in instead.");
  });

  it("keeps validation guidance specific", () => {
    expect(
      getAuthErrorMessage(apiError(400, "Password must be at least 8 characters"), "sign-up"),
    ).toBe("Your password must be at least 8 characters.");
    expect(
      getAuthErrorMessage(apiError(400, "Valid email required"), "sign-up"),
    ).toBe("Enter a valid email address.");
  });

  it("does not expose raw server or JSON errors", () => {
    const message = getAuthErrorMessage(
      apiError(500, '{"error":"database exploded","stack":"secret"}'),
      "sign-up",
    );
    expect(message).toBe("We couldn't create your account right now. Please try again.");
    expect(message).not.toContain("database");
    expect(message).not.toContain("stack");
  });

  it("gives login failures a calm network message", () => {
    expect(
      getAuthErrorMessage(new Error("Network request failed"), "sign-in"),
    ).toBe("We couldn't reach FRAME. Check your connection and try again.");
  });

  it("distinguishes device session storage failures from rejected credentials", () => {
    expect(
      getAuthErrorMessage(
        new AuthSessionError(
          "storage",
          "Your login could not be saved on this device.",
        ),
        "sign-in",
      ),
    ).toBe(
      "Your login couldn't be saved on this device. Please restart FRAME and try again.",
    );
  });
});