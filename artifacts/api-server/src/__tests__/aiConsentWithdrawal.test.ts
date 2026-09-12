import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const { update } = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: { update },
  };
});

import aiConsentRouter from "../routes/aiConsent";

describe("AI consent withdrawal", () => {
  afterEach(() => {
    update.mockClear();
  });

  it.each([
    { accepted: false },
    {},
    { accepted: "true" },
  ])("rejects $accepted without changing stored consent", async (body) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.userId = "test-user";
      next();
    });
    app.use(aiConsentRouter);

    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Test server did not bind to a TCP port");
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/ai-consent`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "AI_CONSENT_REQUIRED",
      });
      expect(update).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});