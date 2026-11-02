import { describe, expect, it } from "vitest";
import { finishedCamps } from "../lib/campHistory";
import type { Competition } from "../lib/competition";

const camp = (id: number, status: string, eventDate: string): Competition =>
  ({ id, status, eventDate, eventName: `Camp ${id}` }) as Competition;

describe("finishedCamps", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  it("keeps completed and lapsed-active camps, newest first", () => {
    const out = finishedCamps(
      [
        camp(1, "completed", "2026-01-01T00:00:00Z"),
        camp(2, "active", "2026-05-01T00:00:00Z"),
        camp(3, "active", "2026-09-01T00:00:00Z"),
        camp(4, "cancelled", "2026-02-01T00:00:00Z"),
      ],
      now,
    );
    expect(out.map((c) => c.id)).toEqual([2, 1]);
  });
});
