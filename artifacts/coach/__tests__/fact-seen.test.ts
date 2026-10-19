import { describe, expect, it } from "vitest";
import { factLastSeen, POST_CHAT_MEMORY_REFRESH_MS } from "../src/lib/fact-seen";

describe("factLastSeen", () => {
  it("uses the latest sighting, with creation as the floor", () => {
    expect(factLastSeen({ createdAt: "2026-09-01T00:00:00Z", lastConfirmedAt: "2026-10-16T00:00:00Z" })).toBe("2026-10-16T00:00:00Z");
    expect(factLastSeen({ createdAt: "2026-09-01T00:00:00Z", lastConfirmedAt: null })).toBe("2026-09-01T00:00:00Z");
    expect(factLastSeen({ createdAt: "2026-09-01T00:00:00Z" })).toBe("2026-09-01T00:00:00Z");
    expect(factLastSeen({ createdAt: "2026-09-01T00:00:00Z", lastConfirmedAt: "garbage" })).toBe("2026-09-01T00:00:00Z");
  });
  it("schedules a post-chat refresh after the extractor can finish", () => {
    expect(POST_CHAT_MEMORY_REFRESH_MS[0]).toBeGreaterThan(0);
  });
});
