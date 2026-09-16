import { describe, expect, it } from "vitest";
import {
  formatSubscriptionPeriod,
  formatSubscriptionRenewal,
  getSubscriptionPeriodLabel,
} from "../lib/subscriptionDisclosure";

describe("subscription period disclosure", () => {
  it.each([
    ["P1W", "1 week"],
    ["P1M", "1 month"],
    ["P3M", "3 months"],
    ["P6M", "6 months"],
    ["P1Y", "1 year"],
  ])("formats %s from App Store metadata", (period, expected) => {
    expect(formatSubscriptionPeriod(period)).toBe(expected);
  });

  it.each([
    ["£4.99", "1 month", "£4.99/month · Auto-renews monthly until cancelled"],
    ["$49.99", "1 year", "$49.99/year · Auto-renews yearly until cancelled"],
    ["€2.99", "1 week", "€2.99/week · Auto-renews weekly until cancelled"],
    ["$12.99", "3 months", "$12.99/3 months · Auto-renews every 3 months until cancelled"],
  ])(
    "keeps localized price %s and formats renewal cadence for %s",
    (price, period, expected) => {
      expect(formatSubscriptionRenewal(price, period)).toBe(expected);
    },
  );

  it.each([null, undefined, "", "monthly", "P1Y1M"])(
    "rejects missing or unsupported period %s",
    (period) => {
      expect(formatSubscriptionPeriod(period)).toBeNull();
    },
  );

  it("accepts an auto-renewing subscription with an App Store period", () => {
    expect(
      getSubscriptionPeriodLabel({
        product: {
          productCategory: "SUBSCRIPTION",
          productType: "AUTO_RENEWABLE_SUBSCRIPTION",
          subscriptionPeriod: "P1Y",
        },
      }),
    ).toBe("1 year");
  });

  it("accepts StoreKit 1 subscription metadata when the subtype is unknown", () => {
    expect(
      getSubscriptionPeriodLabel({
        product: {
          productCategory: "SUBSCRIPTION",
          productType: "UNKNOWN",
          subscriptionPeriod: "P1M",
        },
      }),
    ).toBe("1 month");
  });

  it.each([
    {
      productCategory: "SUBSCRIPTION",
      productType: "AUTO_RENEWABLE_SUBSCRIPTION",
      subscriptionPeriod: null,
    },
    {
      productCategory: "SUBSCRIPTION",
      productType: "AUTO_RENEWABLE_SUBSCRIPTION",
      subscriptionPeriod: "monthly",
    },
    {
      productCategory: "NON_SUBSCRIPTION",
      productType: "NON_CONSUMABLE",
      subscriptionPeriod: "P1M",
    },
    {
      productCategory: "SUBSCRIPTION",
      productType: "NON_RENEWABLE_SUBSCRIPTION",
      subscriptionPeriod: "P1M",
    },
  ])("rejects incomplete or non-renewing product metadata", (product) => {
    expect(
      getSubscriptionPeriodLabel({
        product,
      }),
    ).toBeNull();
  });
});