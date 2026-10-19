/**
 * POST /fighter derives the spirit animal before answering, so the provider call
 * must be bounded: the SDK default is 10 minutes, which froze "Finish setup".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
vi.mock("../lib/aiConsent", () => ({
  AI_PROVIDER_MAX_RETRIES: 0,
  hasAiConsentForUser: async () => true,
}));

import { deriveSpiritAnimal, SPIRIT_ANIMAL_TIMEOUT_MS } from "../lib/spiritAnimals";

const log = { info() {}, error() {} } as never;
const fighter = {
  userId: "u1",
  name: "A",
  age: 30,
  art: "bjj",
  primarySport: "bjj",
  level: "White",
  trainingFrequency: "3-4",
  goals: "",
  weaknesses: "",
  personality: "",
  competes: false,
};

beforeEach(() => {
  create.mockReset();
});

describe("deriveSpiritAnimal timeout", () => {
  it("passes a short per-request timeout to the provider", async () => {
    create.mockResolvedValue({ content: [] });
    await deriveSpiritAnimal(fighter, log);
    expect(SPIRIT_ANIMAL_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({ timeout: SPIRIT_ANIMAL_TIMEOUT_MS });
  });

  it("returns null (profile still saves) when the provider times out", async () => {
    create.mockImplementation(async () => {
      throw new Error("Request timed out.");
    });
    await expect(deriveSpiritAnimal(fighter, log)).resolves.toBeNull();
  });
});
