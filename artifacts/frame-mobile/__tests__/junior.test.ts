import { describe, expect, it } from "vitest";
import { ageLabel, decideEntry, juniorErrorCopy, newClientLogId, sessionsLabel, type JuniorMe } from "../lib/junior";

const me = (roles: JuniorMe["roles"], activeRole: JuniorMe["activeRole"]): JuniorMe => ({ roles, activeRole, staff: [], children: [], parentEntitlement: false });

describe("decideEntry", () => {
  it("keeps the athlete app when the flag is off or config failed", () => {
    expect(decideEntry({ enabled: false }, null)).toBe("athlete");
    expect(decideEntry(null, null, true)).toBe("athlete");
  });
  it("waits while loading", () => {
    expect(decideEntry(null, null)).toBe("loading");
    expect(decideEntry({ enabled: true }, null)).toBe("loading");
  });
  it("existing athletes with no role rows stay on the athlete app", () => {
    expect(decideEntry({ enabled: true }, me([], null))).toBe("athlete");
  });
  it("routes by active role", () => {
    expect(decideEntry({ enabled: true }, me(["parent"], "parent"))).toBe("parent");
    expect(decideEntry({ enabled: true }, me(["parent", "coach"], "coach"))).toBe("coach");
    expect(decideEntry({ enabled: true }, me(["athlete", "parent"], "athlete"))).toBe("athlete");
  });
});

describe("copy and helpers", () => {
  it("explains the paywall without hiding history", () => {
    expect(juniorErrorCopy("PARENT_PLAN_REQUIRED", "x")).toMatch(/history is safe/);
    expect(juniorErrorCopy("SOMETHING_ELSE", "fallback")).toBe("fallback");
  });
  it("labels sessions and age", () => {
    expect(sessionsLabel(1)).toBe("1 session");
    expect(sessionsLabel(3)).toBe("3 sessions");
    expect(ageLabel("2018-03", new Date("2026-06-15T00:00:00Z"))).toBe("8 yr");
    expect(ageLabel("2026-04", new Date("2026-06-15T00:00:00Z"))).toBe("2 mo");
    expect(ageLabel("bad")).toBe("");
  });
  it("generates distinct log ids", () => {
    expect(newClientLogId()).not.toBe(newClientLogId());
    expect(newClientLogId().length).toBeGreaterThanOrEqual(8);
  });
});
