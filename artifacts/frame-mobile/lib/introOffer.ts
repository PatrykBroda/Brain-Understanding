import { formatSubscriptionPeriod } from "./subscriptionDisclosure";

/** The slice of StoreKit's introductory offer (RevenueCat `introPrice`) we read. */
export type StoreIntroPrice = {
  readonly price: number;
  readonly cycles: number;
  readonly period: string;
  readonly periodUnit: string;
  readonly periodNumberOfUnits: number;
};

/** A free trial the user is eligible for, described from StoreKit's own data. */
export type TrialOffer = {
  paymentMode: "FREE_TRIAL";
  /** Whole trial length, e.g. "2 months". */
  periodLabel: string;
};

/** Eligibility status values from RevenueCat's INTRO_ELIGIBILITY_STATUS. */
export const INTRO_ELIGIBLE = 2;

const UNIT_ADJECTIVE: Readonly<Record<string, string>> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

/**
 * Describe the free trial for a product, or null when there is none to show:
 * the user is not eligible (StoreKit says so), the product has no introductory
 * offer, or the offer is not free (a paid intro price is never advertised as a
 * trial). Wording is derived from the offer's period and cycle count, so
 * changing the offer in App Store Connect changes the copy with no app change.
 */
export function describeTrialOffer(
  intro: StoreIntroPrice | null | undefined,
  eligibilityStatus: number | null | undefined,
): TrialOffer | null {
  if (!intro || eligibilityStatus !== INTRO_ELIGIBLE) return null;
  if (intro.price !== 0) return null;
  const unit = UNIT_ADJECTIVE[intro.periodUnit];
  const perCycle = intro.periodNumberOfUnits;
  if (!unit || !Number.isInteger(perCycle) || perCycle < 1) return null;
  const cycles = Number.isInteger(intro.cycles) && intro.cycles >= 1 ? intro.cycles : 1;
  const total = perCycle * cycles;
  return {
    paymentMode: "FREE_TRIAL",
    periodLabel: `${total} ${unit}${total === 1 ? "" : "s"}`,
  };
}

/** "2 months free, then $4.99/month". Price is the post-trial price. */
export function formatTrialHeadline(
  trial: TrialOffer,
  localizedPrice: string,
  billingPeriod: string,
): string {
  const per = billingPeriod.startsWith("1 ") ? billingPeriod.slice(2) : billingPeriod;
  return `${trial.periodLabel} free, then ${localizedPrice}/${per}`;
}

/** Trial-specific disclosure shown under the card. */
export function formatTrialDisclosure(
  trial: TrialOffer,
  localizedPrice: string,
  billingPeriod: string,
): string {
  const per = billingPeriod.startsWith("1 ") ? billingPeriod.slice(2) : billingPeriod;
  return `Free for ${trial.periodLabel}, then ${localizedPrice}/${per}, auto-renewing until cancelled. Cancel anytime in your App Store account settings at least 24 hours before the trial ends to avoid being charged.`;
}

/** Re-exported for callers that only need the billing label. */
export { formatSubscriptionPeriod };
