import { describe, expect, it } from "vitest";
import { resolveTerritory, selectCurrentPrice } from "../lib/appleSubscriptionPrice";

const territory = { type: "territories", id: "POL", attributes: { currency: "PLN" } };
const point = (id: string, customerPrice: string) => ({
  type: "subscriptionPricePoints", id, attributes: { customerPrice },
});
const price = (id: string, startDate: string | null, preserved: boolean, planType = "UPFRONT") => ({
  type: "subscriptionPrices", id,
  attributes: { startDate, preserved, planType },
  relationships: {
    territory: { data: { id: "POL" } },
    subscriptionPricePoint: { data: { id } },
  },
});

describe("Apple subscription price selection", () => {
  it("converts the device's storefront to Apple's territory, without defaulting", () => {
    expect(resolveTerritory("PL", [territory])).toBe("POL");
    expect(() => resolveTerritory("US", [territory])).toThrow();
    expect(() => resolveTerritory("XX", [territory])).toThrow();
    expect(() => resolveTerritory("", [territory])).toThrow();
  });
  it("chooses the latest effective new-subscriber price, not a grandfathered or future price", () => {
    expect(selectCurrentPrice(
      [
        price("old", null, false),
        price("preserved", "2026-01-01", true),
        price("current", "2026-06-01", false),
        price("future", "2026-12-01", false),
        price("installment", "2026-08-01", false, "MONTHLY"),
      ],
      [territory, point("old", "19.99"), point("preserved", "9.99"), point("current", "24.99"), point("future", "29.99"), point("installment", "2.99")],
      "POL", "2026-09-27",
    )).toEqual({ amount: 24.99, currencyCode: "PLN" });
  });
  it("refuses a transition day, ambiguous prices, and missing price metadata", () => {
    expect(() => selectCurrentPrice([price("now", "2026-09-27", false)], [territory, point("now", "29.99")], "POL", "2026-09-27")).toThrow();
    expect(() => selectCurrentPrice([price("a", null, false), price("b", null, false)], [territory, point("a", "24.99"), point("b", "29.99")], "POL", "2026-09-27")).toThrow();
    expect(() => selectCurrentPrice([price("a", null, false)], [territory], "POL", "2026-09-27")).toThrow();
  });
});