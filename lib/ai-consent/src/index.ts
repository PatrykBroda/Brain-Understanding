export type AiConsentDisclosure = {
  providers: readonly string[];
  purpose: string;
  collectionMethod: string;
  use: string;
  retention: string;
  sharedData: readonly string[];
  notShared: readonly string[];
};

// Changing any reviewed disclosure content requires a new version so existing
// users must see and accept the updated contract.
export const AI_CONSENT_VERSION = "2026-09-12";

export const AI_CONSENT_DISCLOSURE = {
  providers: ["Anthropic (Claude)", "OpenAI"],
  purpose:
    "to provide FRAME's AI coaching, planning, memory, spirit-animal and performance-analysis features",
  collectionMethod:
    "You choose to use an AI feature and submit chat messages, profile details, training or session information, images, selected video stills, and other information you provide to FRAME.",
  use:
    "FRAME sends the minimum context needed for the requested feature to Anthropic (Claude) and/or OpenAI, depending on the selected feature and provider, to generate coaching, plans, memory suggestions, spirit-animal descriptions, or performance analysis.",
  retention:
    "FRAME retains account data and generated results according to the Privacy Policy and until you delete them or your account. Providers process submitted requests under their applicable service terms and data-processing commitments; FRAME does not sell this information or use it for advertising.",
  sharedData: [
    "chat messages and the conversation context needed to answer them",
    "training data, session reflections, movement signals, scores, session type and clip duration",
    "athlete profile and context, including sport, experience, goals, weaknesses and relevant performance observations",
    "uploaded images or selected video stills, where applicable to the requested feature",
    "other user-provided information included in the request or needed to provide the feature",
  ],
  notShared: [
    "your email address and account ID",
    "raw video files; analysis uses selected stills and derived movement data where applicable",
  ],
} as const satisfies AiConsentDisclosure;

export function formatProviderList(providers: readonly string[]): string {
  if (providers.length < 2) return providers[0] ?? "";
  return `${providers.slice(0, -1).join(", ")} and/or ${providers.at(-1)}`;
}

export function formatAiConsentSummary(
  disclosure: AiConsentDisclosure = AI_CONSENT_DISCLOSURE,
): string {
  return [
    `I permit FRAME to send the minimum relevant context to ${formatProviderList(disclosure.providers)} ${disclosure.purpose}.`,
    `This may include ${disclosure.sharedData.join("; ")}.`,
    `FRAME does not send ${disclosure.notShared.join("; ")} as AI model context.`,
  ].join(" ");
}