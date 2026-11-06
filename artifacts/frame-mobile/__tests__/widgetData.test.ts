import { describe, it, expect } from "vitest";
import { buildWidgetPayload, daysCaption, payloadChanged } from "../lib/widgetData";

const focus = { title: "Wrestling defence", detail: "Sprawl drills, then light flow rolling.", current: true };
const camp = { eventName: "Nationals", daysToEvent: 12 };

describe("buildWidgetPayload", () => {
  it("shows focus and days left", () => {
    expect(buildWidgetPayload({ date: "2026-11-06", signedIn: true, focus, camp })).toMatchObject({
      v: 1,
      focusTitle: "Wrestling defence",
      daysLeft: 12,
      campName: "Nationals",
      daysCaption: "days left in camp",
    });
  });
  it("signed out shows a neutral prompt, no data", () => {
    const p = buildWidgetPayload({ date: "2026-11-06", signedIn: false, focus, camp });
    expect(p.signedIn).toBe(false);
    expect(p.daysLeft).toBeNull();
    expect(p.focusDetail).not.toContain("Sprawl");
  });
  it("a stale focus is not shown as today's", () => {
    const p = buildWidgetPayload({ date: "2026-11-06", signedIn: true, focus: { ...focus, current: false }, camp: null });
    expect(p.focusTitle).toBe("Check in to get today's focus");
  });
  it("no camp, or a past camp, gives no countdown", () => {
    expect(buildWidgetPayload({ date: "d", signedIn: true, focus, camp: null }).daysLeft).toBeNull();
    expect(buildWidgetPayload({ date: "d", signedIn: true, focus, camp: { eventName: "x", daysToEvent: -2 } }).daysLeft).toBeNull();
  });
  it("clips long text", () => {
    const p = buildWidgetPayload({ date: "d", signedIn: true, focus: { title: "a ".repeat(100), detail: "b".repeat(500) }, camp: null });
    expect(p.focusTitle.length).toBeLessThanOrEqual(60);
    expect(p.focusDetail.length).toBeLessThanOrEqual(120);
    expect(p.focusTitle.endsWith("…")).toBe(true);
  });
  it("captions singular, zero and plural", () => {
    expect(daysCaption(1)).toBe("day left in camp");
    expect(daysCaption(0)).toBe("fight day");
    expect(daysCaption(null)).toBe("");
  });
  it("detects changes", () => {
    const p = buildWidgetPayload({ date: "d", signedIn: true, focus, camp });
    expect(payloadChanged(JSON.stringify(p), p)).toBe(false);
    expect(payloadChanged(null, p)).toBe(true);
  });
  it("uses FRAME terminology only", () => {
    const p = buildWidgetPayload({ date: "d", signedIn: false, focus: null, camp: null });
    expect(JSON.stringify(p)).not.toMatch(/synochi|vault|node/i);
  });
});
