import { describe, expect, it } from "vitest";
import {
  shouldPresentLoginUpsell,
  type LoginUpsellState,
} from "../lib/loginUpsell";

const readyState: LoginUpsellState = {
  routeSegments: ["(tabs)", "home"],
  isLoaded: true,
  isSignedIn: true,
  userId: "user-123",
  hasFighter: true,
  plan: "free",
  purchasesSupported: true,
  promptedForUser: null,
};

describe("shouldPresentLoginUpsell", () => {
  it("waits until onboarding has been replaced by the authenticated tabs", () => {
    expect(
      shouldPresentLoginUpsell({
        ...readyState,
        routeSegments: ["onboarding"],
      }),
    ).toBe(false);
    expect(shouldPresentLoginUpsell(readyState)).toBe(true);
  });

  it("does not present again for the same user in one app session", () => {
    expect(
      shouldPresentLoginUpsell({
        ...readyState,
        promptedForUser: readyState.userId,
      }),
    ).toBe(false);
  });

  it("does not present before the fighter or entitlement is ready", () => {
    expect(
      shouldPresentLoginUpsell({ ...readyState, hasFighter: false }),
    ).toBe(false);
    expect(
      shouldPresentLoginUpsell({ ...readyState, plan: undefined }),
    ).toBe(false);
  });
});