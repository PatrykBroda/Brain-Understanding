import { importPKCS8, SignJWT } from "jose";
import countries from "i18n-iso-countries";

const APPLE_API = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "app.replit.frame";

type Resource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string } | null }>;
};
type Page = {
  data: Resource[];
  included?: Resource[];
  links?: { next?: string | null };
};

export type AppleSubscriptionPrice = {
  productId: string;
  territory: string;
  currencyCode: string;
  localizedPrice: string;
};

export class ApplePriceUnavailable extends Error {}

function requiredConfiguration() {
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const privateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!keyId || !issuerId || !privateKey) {
    throw new ApplePriceUnavailable("Apple subscription pricing is not configured.");
  }
  return { keyId, issuerId, privateKey };
}

async function token(): Promise<string> {
  const { keyId, issuerId, privateKey } = requiredConfiguration();
  // Apple issues .p8 keys once. Keep the key on the server, never in the app.
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

async function pages(path: string, jwt: string): Promise<Page> {
  let url: string | null = new URL(path, APPLE_API).toString();
  const result: Page = { data: [], included: [] };
  const visited = new Set<string>();
  while (url) {
    const current: URL = new URL(url);
    if (current.origin !== APPLE_API || !current.pathname.startsWith("/v1/") || visited.has(url) || visited.size >= 20) {
      throw new ApplePriceUnavailable("Apple pricing pagination was invalid.");
    }
    visited.add(url);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new ApplePriceUnavailable(`Apple pricing API returned ${response.status}.`);
    const page = (await response.json()) as Page;
    if (!Array.isArray(page.data) || (page.included && !Array.isArray(page.included))) {
      throw new ApplePriceUnavailable("Apple pricing data was invalid.");
    }
    result.data.push(...page.data);
    result.included!.push(...(page.included ?? []));
    url = page.links?.next ?? null;
  }
  return result;
}

function one<T>(items: T[], message: string): T {
  if (items.length !== 1) throw new ApplePriceUnavailable(message);
  return items[0];
}

/** Resolve Apple's alpha-3 territory from StoreKit's alpha-2 country.
 * Confirm it is present in Apple's current territory list before using it. */
export function resolveTerritory(countryCode: string, territories: Resource[]): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new ApplePriceUnavailable("The App Store storefront could not be identified.");
  }
  const id = countries.alpha2ToAlpha3(countryCode);
  if (!id || !territories.some((t) => t.type === "territories" && t.id === id)) {
    throw new ApplePriceUnavailable("The App Store storefront has no Apple territory.");
  }
  return id;
}

/** Select only the effective standard price for a new subscriber, not a
 * grandfathered price, an installment plan, or a scheduled future change. */
export function selectCurrentPrice(prices: Resource[], included: Resource[], territory: string, today: string) {
  const candidates = prices.filter((p) =>
    p.type === "subscriptionPrices" &&
    p.relationships?.territory?.data?.id === territory &&
    p.attributes?.preserved === false &&
    p.attributes?.planType === "UPFRONT" &&
    (p.attributes.startDate === null ||
      (typeof p.attributes.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.attributes.startDate) && p.attributes.startDate < today))
  ).sort((a, b) => String(b.attributes?.startDate ?? "").localeCompare(String(a.attributes?.startDate ?? "")));
  // Refuse the day a schedule changes: without Apple's storefront timezone a
  // date-only API value cannot prove which side of midnight StoreKit is on.
  if (prices.some((p) => p.relationships?.territory?.data?.id === territory && p.attributes?.preserved === false && p.attributes?.startDate === today)) {
    throw new ApplePriceUnavailable("The subscription price is changing today.");
  }
  if (!candidates.length) throw new ApplePriceUnavailable("No current standard price was returned by Apple.");
  const latest = candidates[0];
  if (candidates[1]?.attributes?.startDate === latest.attributes?.startDate) {
    throw new ApplePriceUnavailable("Apple returned conflicting current prices.");
  }
  const pointId = latest.relationships?.subscriptionPricePoint?.data?.id;
  const point = one(included.filter((r) => r.type === "subscriptionPricePoints" && r.id === pointId), "Apple did not return the price point.");
  const currency = one(included.filter((r) => r.type === "territories" && r.id === territory), "Apple did not return the territory currency.");
  const amount = point.attributes?.customerPrice;
  const currencyCode = currency.attributes?.currency;
  if (typeof amount !== "string" || !/^\d+(?:\.\d+)?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 ||
      typeof currencyCode !== "string" || !/^[A-Z]{3}$/.test(currencyCode)) {
    throw new ApplePriceUnavailable("Apple returned an invalid price or currency.");
  }
  return { amount: Number(amount), currencyCode };
}

export async function getAppleSubscriptionPrice(productId: string, countryCode: string): Promise<AppleSubscriptionPrice> {
  const jwt = await token();
  const apps = await pages(`/v1/apps?filter%5BbundleId%5D=${encodeURIComponent(BUNDLE_ID)}&limit=200`, jwt);
  const app = one(apps.data.filter((a) => a.type === "apps" && a.attributes?.bundleId === BUNDLE_ID), "Apple app could not be identified.");
  const territories = await pages("/v1/territories?limit=200", jwt);
  const territory = resolveTerritory(countryCode, territories.data);
  const groups = await pages(`/v1/apps/${encodeURIComponent(app.id)}/subscriptionGroups?limit=200`, jwt);
  const matches: Resource[] = [];
  for (const group of groups.data.filter((g) => g.type === "subscriptionGroups")) {
    const subscriptions = await pages(`/v1/subscriptionGroups/${encodeURIComponent(group.id)}/subscriptions?filter%5BproductId%5D=${encodeURIComponent(productId)}&limit=200`, jwt);
    matches.push(...subscriptions.data.filter((s) => s.type === "subscriptions" && s.attributes?.productId === productId));
  }
  const subscription = one(matches, "This offering product was not uniquely found in the Apple app.");
  const schedule = await pages(`/v1/subscriptions/${encodeURIComponent(subscription.id)}/prices?filter%5Bterritory%5D=${encodeURIComponent(territory)}&include=subscriptionPricePoint,territory&limit=200`, jwt);
  const today = new Date().toISOString().slice(0, 10);
  const { amount, currencyCode } = selectCurrentPrice(schedule.data, schedule.included ?? [], territory, today);
  // ICU derives the customary language for the storefront's country without
  // guessing a currency or maintaining a territory-to-locale table.
  const locale = new Intl.Locale(`und-${countryCode}`).maximize();
  const localizedPrice = new Intl.NumberFormat(locale.toString(), { style: "currency", currency: currencyCode }).format(amount);
  return { productId, territory: countryCode, currencyCode, localizedPrice };
}