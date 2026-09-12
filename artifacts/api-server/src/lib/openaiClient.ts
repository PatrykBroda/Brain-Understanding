import OpenAI from "openai";
import { AI_PROVIDER_MAX_RETRIES } from "./aiConsent";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

if (!baseURL || !apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set",
  );
}

export const openai = new OpenAI({ baseURL, apiKey, maxRetries: AI_PROVIDER_MAX_RETRIES });
export const OPENAI_COACH_MODEL = "gpt-5.4";
