import { describe, expect, it } from "vitest";
import { sentenceCase } from "../lib/sentenceCase";
import { buildWidgetPayload } from "../lib/widgetData";

describe("focus title casing", () => {
  it("sentence-cases a Title Cased stored focus title", () => {
    expect(sentenceCase("sparring: Guard Abandonment Is Systemic, Not Situational")).toBe(
      "Sparring: guard abandonment is systemic, not situational",
    );
  });
  it("leaves an already sentence-cased title alone", () => {
    expect(sentenceCase("Takedown defence")).toBe("Takedown defence");
  });
  it("applies to the widget title", () => {
    const p = buildWidgetPayload({
      date: "2026-11-13",
      signedIn: true,
      focus: { title: "Guard Abandonment Is Systemic", detail: "d", current: true },
      camp: null,
    } as never);
    expect(p.focusTitle).toBe("Guard abandonment is systemic");
  });
});
