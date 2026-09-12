export const AI_CONSENT_VERSION = "2026-09-12";

export type AiConsentStatus = {
  accepted: boolean;
  version: string;
  acceptedAt: string | null;
  disclosure: {
    provider: string;
    service: string;
    purpose: string;
    sharedData: readonly string[];
    notShared: readonly string[];
  };
};