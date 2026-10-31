import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "../lib/authErrors";
import { sanitizeResetCode, validateForgotEmail, validateResetForm } from "../lib/resetPasswordForm";

function apiError(status: number, message: string, retryAfterSeconds?: number) {
  return Object.assign(new Error(message), { status, retryAfterSeconds });
}

describe("reset password form", () => {
  it("keeps only the first 6 digits of a pasted code", () => {
    expect(sanitizeResetCode("123 456")).toBe("123456");
    expect(sanitizeResetCode("12ab34567890")).toBe("123456");
  });

  it("validates the email", () => {
    expect(validateForgotEmail("")).toBeTruthy();
    expect(validateForgotEmail("nope")).toBeTruthy();
    expect(validateForgotEmail(" a@b.co ")).toBeNull();
  });

  it("requires a 6-digit code, an 8+ char password and a matching confirmation", () => {
    expect(validateResetForm({ code: "12345", password: "longenough", confirm: "longenough" }).code).toBeTruthy();
    expect(validateResetForm({ code: "123456", password: "short", confirm: "short" }).password).toBeTruthy();
    expect(validateResetForm({ code: "123456", password: "longenough", confirm: "different1" }).confirm).toBeTruthy();
    expect(validateResetForm({ code: "123456", password: "longenough", confirm: "longenough" })).toEqual({});
  });
});

describe("reset password error copy", () => {
  it("uses generic copy for an invalid or expired code", () => {
    expect(
      getAuthErrorMessage(apiError(400, "That code is invalid or has expired."), "reset-password"),
    ).toMatch(/invalid or has expired/);
  });

  it("explains the rate limit", () => {
    expect(getAuthErrorMessage(apiError(429, "Too many requests.", 900), "forgot-password")).toBe(
      "Too many attempts at resetting your password. Please wait about 15 minutes, then try again.",
    );
  });

  it("has fallback copy for both actions", () => {
    expect(getAuthErrorMessage(new Error("x"), "forgot-password")).toMatch(/send a code/);
    expect(getAuthErrorMessage(new Error("x"), "reset-password")).toMatch(/reset your password/);
  });
});
