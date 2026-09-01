import { describe, expect, it } from "vitest";
import { shouldLeaveOnboarding } from "../lib/onboardingRoute";

describe("shouldLeaveOnboarding", () => {
  it("leaves when a fighter already exists", () => {
    expect(shouldLeaveOnboarding(true, false)).toBe(true);
  });

  it("leaves after the current profile save succeeds", () => {
    expect(shouldLeaveOnboarding(false, true)).toBe(true);
  });

  it("keeps showing the form for a new unsaved account", () => {
    expect(shouldLeaveOnboarding(false, false)).toBe(false);
  });
});