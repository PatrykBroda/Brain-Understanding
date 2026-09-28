import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getAppleSubscriptionPrice, resolveTerritory, selectCurrentPrice } from "../lib/appleSubscriptionPrice";

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
  it("looks up a GBR storefront through Apple's full API flow and returns a GBP price", async () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    vi.stubEnv("APP_STORE_CONNECT_API_KEY_ID", "test-key-id");
    vi.stubEnv("APP_STORE_CONNECT_API_ISSUER_ID", "test-issuer");
    vi.stubEnv("APP_STORE_CONNECT_PRIVATE_KEY", privateKey);
    const fetchApple = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      let data: unknown[];
      let included: unknown[] | undefined;
      if (url.pathname === "/v1/apps") {
        data = [{ type: "apps", id: "app-1", attributes: { bundleId: "app.replit.frame" } }];
      } else if (url.pathname === "/v1/territories") {
        data = [{ type: "territories", id: "GBR", attributes: { currency: "GBP" } }];
      } else if (url.pathname.endsWith("/subscriptionGroups")) {
        data = [{ type: "subscriptionGroups", id: "group-1" }];
      } else if (url.pathname.endsWith("/subscriptions")) {
        data = [{ type: "subscriptions", id: "subscription-1", attributes: { productId: "app.test.monthly" } }];
      } else if (url.pathname.endsWith("/prices")) {
        data = [{
          type: "subscriptionPrices", id: "price-1",
          attributes: { startDate: null, preserved: false, planType: "UPFRONT" },
          relationships: {
            territory: { data: { id: "GBR" } },
            subscriptionPricePoint: { data: { id: "point-1" } },
          },
        }];
        included = [
          { type: "subscriptionPricePoints", id: "point-1", attributes: { customerPrice: "7.99" } },
          { type: "territories", id: "GBR", attributes: { currency: "GBP" } },
        ];
      } else {
        throw new Error(`Unexpected Apple endpoint: ${url.pathname}`);
      }
      return new Response(JSON.stringify({ data, included }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchApple);

    try {
      const result = await getAppleSubscriptionPrice("app.test.monthly", "GBR");
      expect(result).toEqual({
        productId: "app.test.monthly",
        territory: "GBR",
        currencyCode: "GBP",
        localizedPrice: "£7.99",
      });
      expect(fetchApple).toHaveBeenCalledTimes(5);
      const priceRequest = fetchApple.mock.calls
        .map(([input]) => String(input))
        .find((url) => url.includes("/prices?"));
      expect(priceRequest).toContain("filter%5Bterritory%5D=GBR");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("converts the device's storefront to Apple's territory, without defaulting", () => {
    expect(resolveTerritory("PL", [territory])).toBe("POL");
    expect(resolveTerritory("POL", [territory])).toBe("POL");
    expect(resolveTerritory("GBR", [{ ...territory, id: "GBR", attributes: { currency: "GBP" } }])).toBe("GBR");
    expect(() => resolveTerritory("USA", [territory])).toThrow();
    expect(() => resolveTerritory("US", [territory])).toThrow();
    expect(() => resolveTerritory("XX", [territory])).toThrow();
    expect(() => resolveTerritory("ZZZ", [territory])).toThrow();
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