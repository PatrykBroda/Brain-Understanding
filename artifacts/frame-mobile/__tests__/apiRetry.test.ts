import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));

import { apiGet } from "../lib/api";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => vi.resetAllMocks());

describe("apiGet transport retry", () => {
  it("retries once when the connection drops, then returns the data", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError("fetch failed: The network connection was lost."))
      .mockResolvedValueOnce(ok({ price: "£4.99" }));
    await expect(apiGet("/billing/apple-price")).resolves.toEqual({ price: "£4.99" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("surfaces the error if the retry also fails", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("fetch failed: The network connection was lost."));
    await expect(apiGet("/x")).rejects.toThrow("network connection was lost");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry HTTP errors", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => '{"error":"down"}' });
    await expect(apiGet("/x")).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
