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

import { emptyStateCopy, inviteActionPath, privacySummary, recapLine, timelineDayLabel, timelineLabel } from "../lib/junior";

describe("junior phase 2 helpers", () => {
  it("labels and day headings", () => {
    expect(timelineLabel("star")).toBe("Star of the Week");
    const now = new Date("2026-11-17T10:00:00Z");
    expect(timelineDayLabel("2026-11-17T03:00:00Z", now)).toBe("Today");
    expect(timelineDayLabel("2026-11-16T05:00:00Z", now)).toBe("Yesterday");
    expect(timelineDayLabel("2026-11-10T05:00:00Z", now)).toMatch(/10 Nov/);
  });
  it("empty states prefer server text", () => {
    expect(emptyStateCopy(null)).toBeNull();
    expect(emptyStateCopy({ code: "NO_GYM", message: "server says" })).toBe("server says");
    expect(emptyStateCopy({ code: "NO_GROUP", message: "" })).toMatch(/class group/);
    expect(emptyStateCopy({ code: "???", message: "" })).toMatch(/Nothing/);
  });
  it("invite paths, privacy summary and recap never say absent", () => {
    expect(inviteActionPath({ kind: "guardian", id: "x" }, "decline")).toBe("/junior/my/invites/guardian/x/decline");
    expect(privacySummary({ coachSeesWellbeing: false, teamSeesRecognition: true })).toMatch(/cannot/);
    expect(recapLine({ sessionsLogged: 3, classesHeld: 5 })).toBe("3 logged of 5 classes (2 not logged)");
    expect(recapLine({ sessionsLogged: 3, classesHeld: 5 }).toLowerCase()).not.toContain("absent");
    expect(recapLine({ sessionsLogged: 2, classesHeld: 2 })).toBe("2 logged of 2 classes");
  });
});
