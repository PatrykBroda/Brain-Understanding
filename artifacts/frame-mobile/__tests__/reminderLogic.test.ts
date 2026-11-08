import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATE,
  formatTime,
  isCheckinTap,
  parseReminderState,
  popupToShow,
  shiftTime,
  withFirstSeen,
} from "../lib/reminderLogic";

const seen = { ...DEFAULT_STATE, firstSeen: "2026-11-01" };

describe("parseReminderState", () => {
  it("defaults to off for empty / garbage", () => {
    expect(parseReminderState(null)).toEqual(DEFAULT_STATE);
    expect(parseReminderState("{nope")).toEqual(DEFAULT_STATE);
    expect(DEFAULT_STATE.enabled).toBe(false);
  });
  it("clamps out-of-range times and rejects bad dates", () => {
    const s = parseReminderState(JSON.stringify({ enabled: true, hour: 99, minute: -4, firstSeen: "yesterday" }));
    expect(s).toMatchObject({ enabled: true, hour: 23, minute: 0, firstSeen: null });
  });
});

describe("shiftTime / formatTime", () => {
  it("wraps around midnight both ways", () => {
    expect(shiftTime(23, 45, 30)).toEqual({ hour: 0, minute: 15 });
    expect(shiftTime(0, 10, -30)).toEqual({ hour: 23, minute: 40 });
  });
  it("zero pads", () => expect(formatTime(7, 5)).toBe("07:05"));
});

describe("popupToShow", () => {
  it("never on the first day (no cold-launch prompt)", () => {
    expect(popupToShow(seen, "2026-11-01", true)).toBeNull();
    expect(popupToShow(DEFAULT_STATE, "2026-11-01", true)).toBeNull();
  });
  it("not when signed out", () => expect(popupToShow(seen, "2026-11-02", false)).toBeNull());
  it("offers the reminder while off and undeclined", () =>
    expect(popupToShow(seen, "2026-11-02", true)).toBe("checkin-with-offer"));
  it("plain check-in once enabled or declined", () => {
    expect(popupToShow({ ...seen, enabled: true }, "2026-11-02", true)).toBe("checkin");
    expect(popupToShow({ ...seen, declinedOffer: true }, "2026-11-02", true)).toBe("checkin");
  });
  it("at most once per local day", () => {
    expect(popupToShow({ ...seen, lastPopup: "2026-11-02" }, "2026-11-02", true)).toBeNull();
    expect(popupToShow({ ...seen, lastPopup: "2026-11-02" }, "2026-11-03", true)).not.toBeNull();
  });
});

describe("withFirstSeen / isCheckinTap", () => {
  it("sets first-seen once", () => {
    expect(withFirstSeen(DEFAULT_STATE, "2026-11-01").firstSeen).toBe("2026-11-01");
    expect(withFirstSeen(seen, "2026-11-05").firstSeen).toBe("2026-11-01");
  });
  it("recognises only the check-in payload", () => {
    expect(isCheckinTap({ route: "checkin" })).toBe(true);
    expect(isCheckinTap({ route: "other" })).toBe(false);
    expect(isCheckinTap(null)).toBe(false);
  });
});
