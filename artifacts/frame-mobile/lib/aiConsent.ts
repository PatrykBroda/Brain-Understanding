export { AI_CONSENT_VERSION } from "@workspace/ai-consent";

export type AiConsentStatus = {
  accepted: boolean;
  version: string;
  acceptedAt: string | null;
  disclosure: {
    providers: readonly string[];
    purpose: string;
    collectionMethod: string;
    use: string;
    retention: string;
    sharedData: readonly string[];
    notShared: readonly string[];
  };
};