import { describe, expect, it } from "vitest";
import apiRouter from "../routes";
import { requireCurrentAiConsent } from "../lib/aiConsent";

type Layer = {
  handle?: unknown;
  route?: { path?: string };
  stack?: Layer[];
};

const stackOf = (value: unknown): Layer[] => {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return [];
  }
  return ((value as { stack?: Layer[] }).stack ?? []);
};

function mountedRouterIndex(path: string): number {
  return stackOf(apiRouter).findIndex((layer) =>
    stackOf(layer.handle).some((child) => child.route?.path === path),
  );
}

describe("authenticated AI-consent route contract", () => {
  it("runs the consent and account-deletion exemptions before the gate", () => {
    const stack = stackOf(apiRouter);
    const gateIndex = stack.findIndex(
      (layer) => layer.handle === requireCurrentAiConsent,
    );

    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(mountedRouterIndex("/ai-consent")).toBeLessThan(gateIndex);
    expect(mountedRouterIndex("/account")).toBeLessThan(gateIndex);
  });

  it("keeps authentication, legal pages, and sign-out public and ahead of the gate", () => {
    const stack = stackOf(apiRouter);
    const gateIndex = stack.findIndex(
      (layer) => layer.handle === requireCurrentAiConsent,
    );

    expect(mountedRouterIndex("/auth/logout")).toBeLessThan(gateIndex);
    expect(mountedRouterIndex("/privacy")).toBeLessThan(gateIndex);
    expect(mountedRouterIndex("/terms")).toBeLessThan(gateIndex);
  });

  it("places ordinary authenticated FRAME routes behind the gate", () => {
    const stack = stackOf(apiRouter);
    const gateIndex = stack.findIndex(
      (layer) => layer.handle === requireCurrentAiConsent,
    );

    expect(mountedRouterIndex("/fighter")).toBeGreaterThan(gateIndex);
  });
});