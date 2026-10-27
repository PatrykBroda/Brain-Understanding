import { describe, expect, it } from "vitest";
import {
  INTRO_ELIGIBLE,
  describeTrialOffer,
  formatTrialDisclosure,
  formatTrialHeadline,
} from "../lib/introOffer";

const free = { price: 0, cycles: 1, period: "P2M", periodUnit: "MONTH", periodNumberOfUnits: 2 };

describe("describeTrialOffer", () => {
  it("describes a free offer for an eligible user from StoreKit's period data", () => {
    expect(describeTrialOffer(free, INTRO_ELIGIBLE)).toEqual({
      paymentMode: "FREE_TRIAL",
      periodLabel: "2 months",
    });
  });

  it("derives the wording from the offer, not a hardcoded 2 months", () => {
    const week = { ...free, period: "P1W", periodUnit: "WEEK", periodNumberOfUnits: 1 };
    expect(describeTrialOffer(week, INTRO_ELIGIBLE)?.periodLabel).toBe("1 week");
    expect(describeTrialOffer({ ...week, cycles: 3 }, INTRO_ELIGIBLE)?.periodLabel).toBe("3 weeks");
  });

  it("returns null unless eligible, free and well-formed", () => {
    expect(describeTrialOffer(free, 0)).toBeNull();
    expect(describeTrialOffer(free, 1)).toBeNull();
    expect(describeTrialOffer(free, undefined)).toBeNull();
    expect(describeTrialOffer(null, INTRO_ELIGIBLE)).toBeNull();
    expect(describeTrialOffer({ ...free, price: 0.99 }, INTRO_ELIGIBLE)).toBeNull();
    expect(describeTrialOffer({ ...free, periodUnit: "UNKNOWN" }, INTRO_ELIGIBLE)).toBeNull();
  });
});

describe("trial copy", () => {
  const trial = { paymentMode: "FREE_TRIAL" as const, periodLabel: "2 months" };

  it("states the free period then the post-trial price in the store's currency", () => {
    expect(formatTrialHeadline(trial, "£4.99", "1 month")).toBe("2 months free, then £4.99/month");
  });

  it("discloses auto-renewal and how to cancel", () => {
    const text = formatTrialDisclosure(trial, "$4.99", "1 month");
    expect(text).toContain("$4.99/month");
    expect(text).toContain("auto-renewing");
    expect(text).toContain("Cancel anytime");
    expect(text).toContain("24 hours");
  });
});
