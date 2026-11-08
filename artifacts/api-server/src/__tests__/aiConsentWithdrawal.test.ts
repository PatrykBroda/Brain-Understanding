import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { update, set, where, select, from, limit } = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: { update, select },
  };
});

import aiConsentRouter from "../routes/aiConsent";

describe("AI consent withdrawal", () => {
  beforeEach(() => {
    where.mockResolvedValue(undefined);
    set.mockReturnValue({ where });
    update.mockReturnValue({ set });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
  });

  afterEach(() => {
    update.mockClear();
    set.mockClear();
    where.mockClear();
    select.mockClear();
    from.mockClear();
    limit.mockClear();
  });

  it.each([{}, { accepted: "true" }])(
    "rejects invalid $accepted without changing stored consent",
    async (body) => {
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
        code: "INVALID_AI_CONSENT",
      });
      expect(update).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
    },
  );

  it("clears the stored consent version and timestamp", async () => {
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
          body: JSON.stringify({ accepted: false }),
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        accepted: false,
        acceptedAt: null,
      });
      expect(set).toHaveBeenCalledWith({
        aiAnalysisConsentVersion: null,
        aiAnalysisConsentAt: null,
      });
    } finally {
      server.close();
    }
  });

  it("returns the authenticated user's current consent status", async () => {
    const acceptedAt = new Date("2026-10-01T12:00:00.000Z");
    where.mockReturnValue({ limit });
    limit.mockResolvedValue([
      { version: "2026-09-16", acceptedAt },
    ]);

    const app = express();
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
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        accepted: true,
        version: "2026-09-16",
        acceptedAt: acceptedAt.toISOString(),
      });
    } finally {
      server.close();
    }
  });
});