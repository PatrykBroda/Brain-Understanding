import { describe, it, expect } from "vitest";
import { formatMinutes, isValidExpoToken, parsePushTarget, shiftMinutes } from "../lib/pushClientLogic";

describe("pushClientLogic", () => {
  it("validates Expo tokens", () => {
    expect(isValidExpoToken("ExponentPushToken[abcdefgh12]")).toBe(true);
    expect(isValidExpoToken("ExpoPushToken[abcdefgh12]")).toBe(true);
    expect(isValidExpoToken("fcm-token")).toBe(false);
    expect(isValidExpoToken(undefined)).toBe(false);
  });
  it("parses push targets", () => {
    expect(parsePushTarget({ route: "checkin" })).toEqual({ kind: "checkin" });
    expect(parsePushTarget({ route: "analysis", analysisId: "7" })).toEqual({ kind: "analysis", analysisId: "7" });
    expect(parsePushTarget({ route: "analysis" })).toBeNull();
    expect(parsePushTarget({ route: "camp", competitionId: 3 })).toEqual({ kind: "camp", competitionId: "3" });
    expect(parsePushTarget({ route: "camp" })).toEqual({ kind: "camp", competitionId: undefined });
    expect(parsePushTarget(null)).toBeNull();
    expect(parsePushTarget({ kind: "daily" })).toBeNull();
  });
  it("shifts and formats minutes with wrap", () => {
    expect(shiftMinutes(1430, 30)).toBe(20);
    expect(shiftMinutes(10, -30)).toBe(1420);
    expect(formatMinutes(1260)).toBe("21:00");
    expect(formatMinutes(485)).toBe("08:05");
  });
});
