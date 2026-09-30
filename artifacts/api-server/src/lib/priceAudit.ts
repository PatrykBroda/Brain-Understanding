import { logger } from "./logger";

/**
 * Price audit for the FRAME+ paywall (App Review 3.1.2(c)).
 *
 * The client reports what the paywall card actually rendered alongside what
 * StoreKit said about the same product. Later, RevenueCat's purchase webhook
 * reports what Apple actually charged. This module judges both and posts a
 * one-line verdict to the audit sink (relayed into Discord) so a tester sees, without digging
 * through deployment logs, whether the price on screen was the price billed.
 *
 * The card-vs-StoreKit comparison is a hint, not proof: TestFlight's StoreKit
 * metadata is known to report USD while the sheet bills local currency, and a
 * past incident had StoreKit wrong and Connect right. The charged-vs-shown
 * comparison on purchase is the ground truth.
 */

export type ShownPrice = {
  stage: "shown" | "prepurchase";
  productIdentifier: string;
  storefrontCountryCode: string | null;
  displayedTerritory: string;
  displayedCurrencyCode: string;
  displayedPrice: string;
  displayedAmount: number | null;
  storePriceString: string;
  storeCurrencyCode: string;
};

export type ChargedPrice = {
  type: string;
  productId: string;
  currency: string;
  amount: number;
  countryCode: string | null;
  environment: string | null;
};

export type Verdict = { ok: boolean; text: string };

type ShownMeta = { appVersion?: string; buildVersion?: string | null };

const SHOWN_TTL_MS = 30 * 60 * 1000;
const DEDUPE_MS = 15 * 60 * 1000;

const lastShown = new Map<string, { at: number; price: ShownPrice }>();
const recentlyNotified = new Map<string, number>();

function build(meta: ShownMeta): string {
  if (!meta.appVersion) return "";
  return ` · build ${meta.appVersion}${meta.buildVersion ? ` (${meta.buildVersion})` : ""}`;
}

export function judgeShown(p: ShownPrice, meta: ShownMeta = {}): Verdict {
  const head = `card shows **${p.displayedPrice}** (${p.displayedCurrencyCode}, looked up for ${p.displayedTerritory}) · device storefront ${p.storefrontCountryCode ?? "unknown"} · StoreKit says ${p.storePriceString} (${p.storeCurrencyCode})${build(meta)}`;
  const label = p.stage === "prepurchase" ? "before purchase sheet" : "paywall";
  if (p.displayedCurrencyCode === p.storeCurrencyCode) {
    return { ok: true, text: `✅ FRAME+ ${label}: MATCH — ${head}` };
  }
  return {
    ok: false,
    text: `⚠️ FRAME+ ${label}: MISMATCH — ${head}. Card currency and StoreKit currency disagree; one of them is wrong for this device. Buy it to see which one Apple charges.`,
  };
}

export function judgeCharged(c: ChargedPrice, shown: ShownPrice | null): Verdict {
  const charged = `${c.amount} ${c.currency}${c.countryCode ? ` (${c.countryCode})` : ""}${c.environment ? ` · ${c.environment}` : ""}`;
  if (!shown) {
    return {
      ok: false,
      text: `❔ FRAME+ ${c.type}: Apple charged **${charged}** for ${c.productId}; no paywall price was reported in the last 30 min to compare against.`,
    };
  }
  const sameCurrency = shown.displayedCurrencyCode === c.currency;
  const sameAmount =
    shown.displayedAmount === null || Math.abs(shown.displayedAmount - c.amount) < 0.005;
  if (sameCurrency && sameAmount) {
    return {
      ok: true,
      text: `✅ FRAME+ ${c.type}: CORRECT — card showed ${shown.displayedPrice}, Apple charged **${charged}**.`,
    };
  }
  return {
    ok: false,
    text: `❌ FRAME+ ${c.type}: WRONG PRICE — card showed ${shown.displayedPrice} (${shown.displayedCurrencyCode}, for storefront ${shown.storefrontCountryCode ?? "unknown"}) but Apple charged **${charged}**. StoreKit had said ${shown.storePriceString} (${shown.storeCurrencyCode}).`,
  };
}

export function recordShown(p: ShownPrice, now = Date.now()): void {
  lastShown.set(p.productIdentifier, { at: now, price: p });
}

export function shownFor(productId: string, now = Date.now()): ShownPrice | null {
  const entry = lastShown.get(productId);
  if (!entry || now - entry.at > SHOWN_TTL_MS) return null;
  return entry.price;
}

/** True the first time a key is seen within the dedupe window. */
export function shouldNotify(key: string, now = Date.now()): boolean {
  const last = recentlyNotified.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) return false;
  recentlyNotified.set(key, now);
  return true;
}

export function resetPriceAudit(): void {
  lastShown.clear();
  recentlyNotified.clear();
}

/**
 * Best-effort post to the audit sink (the DNZ panel's /api/frame-price-audit,
 * which relays into Discord). Never throws; with no sink configured it only
 * logs.
 */
export async function notifyPriceAudit(text: string, ok: boolean | null = null): Promise<void> {
  logger.info({ type: "price_audit", ok }, text);
  const url = process.env["PRICE_AUDIT_URL"];
  const token = process.env["PRICE_AUDIT_TOKEN"];
  if (!url || !token) return;
  try {
    const resp = await globalThis.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: text.slice(0, 1900), ok }),
    });
    if (!resp.ok) logger.warn({ status: resp.status }, "price audit post failed");
  } catch (err) {
    logger.warn({ err }, "price audit post errored");
  }
}

/** Client paywall report → verdict → audit sink (deduped per identical verdict). */
export function auditShown(p: ShownPrice, meta: ShownMeta = {}): Verdict {
  recordShown(p);
  const verdict = judgeShown(p, meta);
  const key = [p.stage, p.productIdentifier, p.storefrontCountryCode, p.displayedPrice, p.storePriceString, meta.buildVersion].join("|");
  if (p.stage === "prepurchase" || shouldNotify(key)) void notifyPriceAudit(verdict.text, verdict.ok);
  return verdict;
}

/** RevenueCat purchase webhook → compare with what the card last showed. */
export function auditCharged(c: ChargedPrice): Verdict {
  const verdict = judgeCharged(c, shownFor(c.productId));
  void notifyPriceAudit(verdict.text, verdict.ok);
  return verdict;
}
