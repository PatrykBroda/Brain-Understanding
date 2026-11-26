import { describe, expect, it } from "vitest";
import { ageOnDate, deltaLabel, isBirthDate, joinStatusLabel, joinStatusLine, joinStatusTone, lastActiveLabel, loginBlockedReason, minutesLabel, ordinal, pctLabel } from "../lib/juniorAccounts";

describe("juniorAccounts helpers", () => {
  it("join status labels and tones", () => {
    expect(joinStatusLabel("pending")).toBe("Pending");
    expect(joinStatusTone("pending")).toBe("wait");
    expect(joinStatusTone("approved")).toBe("ok");
    expect(joinStatusTone("declined")).toBe("no");
  });
  it("status line says nothing is shared while pending", () => {
    expect(joinStatusLine({ status: "pending", gymName: "Iron Gym", childName: "Ava", kind: "junior" })).toContain("Nothing about Ava is shared");
    expect(joinStatusLine({ status: "approved", gymName: "Iron Gym", childName: null, kind: "member" })).toBe("You are a member of Iron Gym.");
  });
  it("number labels", () => {
    expect(pctLabel(null)).toBe("n/a");
    expect(pctLabel(0.756)).toBe("76%");
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(125)).toBe("2 h 5 min");
    expect(deltaLabel({ delta: 20, deltaPct: 50 })).toBe("+20 min (+50%)");
    expect(deltaLabel({ delta: -5, deltaPct: null })).toBe("-5 min");
    expect([1, 2, 3, 4, 11, 12, 21].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "21st"]);
  });
  it("birth date and age", () => {
    expect(isBirthDate("2015-02-30")).toBe(false);
    expect(isBirthDate("2015-02-28")).toBe(true);
    expect(ageOnDate("2015-06-15", new Date("2026-06-14T00:00:00Z"))).toBe(10);
    expect(ageOnDate("2015-06-15", new Date("2026-06-15T00:00:00Z"))).toBe(11);
  });
  it("login rule and last active", () => {
    expect(loginBlockedReason(12, 13)).toContain("13");
    expect(loginBlockedReason(13, 13)).toBeNull();
    const now = new Date("2026-11-26T12:00:00Z");
    expect(lastActiveLabel(null, now)).toBe("Not active yet");
    expect(lastActiveLabel("2026-11-26T01:00:00Z", now)).toBe("Today");
    expect(lastActiveLabel("2026-11-24T01:00:00Z", now)).toBe("2 days ago");
  });
});
