import { describe, it, expect, vi } from "vitest";

// The service imports @workspace/db (which would open a DB pool on load). We only
// exercise its PURE mapping helpers here, so stub the module to the shape those
// helpers reference (SESSION_TYPES is re-exported; nothing else runs at import).
vi.mock("@workspace/db", () => ({
  db: {},
  googleCalendarConnectionsTable: {},
  googleOauthStatesTable: {},
  trainingSessionsTable: {},
  SESSION_TYPES: [
    "sparring",
    "wrestling",
    "bjj",
    "striking",
    "conditioning",
    "recovery",
    "mobility",
  ],
}));

import {
  encryptWithKey,
  decryptWithKey,
  signStateWithSecret,
  verifyStateWithSecret,
  type StatePayload,
} from "../lib/googleCrypto";
import {
  suggestSessionType,
  formatInTz,
  eventToPreview,
  sessionToEvent,
} from "../lib/googleCalendarService";

// ── Token encryption at rest (AES-256-GCM) ──────────────────────────────────

describe("googleCrypto: encrypt/decrypt", () => {
  const KEY = "test-key-material-abc123";

  it("round-trips plaintext", () => {
    const secret = "ya29.a-refresh-token-value";
    const enc = encryptWithKey(secret, KEY);
    expect(enc).not.toContain(secret);
    expect(enc.split(":")).toHaveLength(3);
    expect(decryptWithKey(enc, KEY)).toBe(secret);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptWithKey("same", KEY);
    const b = encryptWithKey("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptWithKey(a, KEY)).toBe("same");
    expect(decryptWithKey(b, KEY)).toBe("same");
  });

  it("throws when decrypting with the wrong key", () => {
    const enc = encryptWithKey("secret", KEY);
    expect(() => decryptWithKey(enc, "different-key")).toThrow();
  });

  it("throws on a tampered ciphertext (auth tag mismatch)", () => {
    const enc = encryptWithKey("secret", KEY);
    const [iv, tag, data] = enc.split(":");
    const flipped = data!.slice(0, -2) + (data!.endsWith("A") ? "B" : "A") + "=";
    expect(() => decryptWithKey(`${iv}:${tag}:${flipped}`, KEY)).toThrow();
  });

  it("throws on a malformed payload", () => {
    expect(() => decryptWithKey("not-a-valid-payload", KEY)).toThrow(
      /malformed ciphertext/,
    );
  });
});

// ── OAuth state: signed identity carrier ────────────────────────────────────

describe("googleCrypto: state sign/verify", () => {
  const SECRET = "session-secret-xyz";
  const future = Date.now() + 60_000;
  const base: StatePayload = { u: "user_123", n: "nonce_abc", e: future };

  it("verifies a freshly signed state", () => {
    const state = signStateWithSecret(base, SECRET);
    expect(verifyStateWithSecret(state, SECRET)).toEqual(base);
  });

  it("rejects a wrong secret", () => {
    const state = signStateWithSecret(base, SECRET);
    expect(verifyStateWithSecret(state, "attacker-secret")).toBeNull();
  });

  it("rejects a tampered payload body", () => {
    const state = signStateWithSecret(base, SECRET);
    const dot = state.lastIndexOf(".");
    const body = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    // flip one char in the body → signature no longer matches
    const badBody = body.slice(0, -1) + (body.endsWith("A") ? "B" : "A");
    expect(verifyStateWithSecret(`${badBody}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const state = signStateWithSecret(base, SECRET);
    expect(verifyStateWithSecret(`${state}x`, SECRET)).toBeNull();
  });

  it("rejects an expired state", () => {
    const expired: StatePayload = { u: "u", n: "n", e: Date.now() - 1000 };
    const state = signStateWithSecret(expired, SECRET);
    expect(verifyStateWithSecret(state, SECRET)).toBeNull();
  });

  it("honours an injected `now` for expiry checks", () => {
    const state = signStateWithSecret(base, SECRET);
    // valid at future-1, invalid once now passes the expiry
    expect(verifyStateWithSecret(state, SECRET, future - 1)).toEqual(base);
    expect(verifyStateWithSecret(state, SECRET, future + 1)).toBeNull();
  });

  it("rejects a state with no separator", () => {
    expect(verifyStateWithSecret("nodothere", SECRET)).toBeNull();
  });
});

// ── suggestSessionType (title → SessionType heuristic) ───────────────────────

describe("suggestSessionType", () => {
  it("maps keywords to the right type", () => {
    expect(suggestSessionType("Hard sparring round")).toBe("sparring");
    expect(suggestSessionType("Wrestling takedowns")).toBe("wrestling");
    expect(suggestSessionType("BJJ open mat")).toBe("bjj");
    expect(suggestSessionType("Jiu jitsu rolls")).toBe("bjj");
    expect(suggestSessionType("Muay Thai pads")).toBe("striking");
    expect(suggestSessionType("Strength & conditioning")).toBe("conditioning");
    expect(suggestSessionType("Recovery / massage")).toBe("recovery");
    expect(suggestSessionType("Mobility + stretch")).toBe("mobility");
  });

  it("falls back to conditioning for unknown titles", () => {
    expect(suggestSessionType("Dentist appointment")).toBe("conditioning");
    expect(suggestSessionType("")).toBe("conditioning");
  });
});

// ── formatInTz ──────────────────────────────────────────────────────────────

describe("formatInTz", () => {
  it("splits an ISO instant into wall date + time for a timezone", () => {
    const { date, time } = formatInTz("2026-07-06T13:30:00Z", "UTC");
    expect(date).toBe("2026-07-06");
    expect(time).toBe("13:30");
  });

  it("shifts across midnight for a western timezone", () => {
    // 01:30Z on Jul 6 is 21:30 the prior day in New York (EDT, UTC-4)
    const { date, time } = formatInTz("2026-07-06T01:30:00Z", "America/New_York");
    expect(date).toBe("2026-07-05");
    expect(time).toBe("21:30");
  });
});

// ── eventToPreview (Google event → import preview) ───────────────────────────

describe("eventToPreview", () => {
  it("maps an all-day event", () => {
    const item = eventToPreview(
      { id: "ev1", summary: "BJJ open mat", start: { date: "2026-07-06" }, end: { date: "2026-07-07" } },
      "UTC",
    );
    expect(item).toEqual({
      externalEventId: "ev1",
      title: "BJJ open mat",
      sessionDate: "2026-07-06",
      startTime: null,
      durationMin: null,
      suggestedType: "bjj",
    });
  });

  it("maps a timed event and computes duration", () => {
    const item = eventToPreview(
      {
        id: "ev2",
        summary: "Sparring",
        start: { dateTime: "2026-07-06T09:00:00Z", timeZone: "UTC" },
        end: { dateTime: "2026-07-06T10:30:00Z", timeZone: "UTC" },
      },
      "UTC",
    );
    expect(item).toMatchObject({
      externalEventId: "ev2",
      startTime: "09:00",
      durationMin: 90,
      suggestedType: "sparring",
    });
  });

  it("returns null when the event has no id", () => {
    expect(eventToPreview({ summary: "x", start: { date: "2026-07-06" } }, "UTC")).toBeNull();
  });

  it("returns null when the event has no start", () => {
    expect(eventToPreview({ id: "ev3", summary: "x" }, "UTC")).toBeNull();
  });

  it("defaults the title when summary is missing", () => {
    const item = eventToPreview({ id: "ev4", start: { date: "2026-07-06" } }, "UTC");
    expect(item?.title).toBe("(untitled)");
  });
});

// ── sessionToEvent (FRAME session → Google event) ────────────────────────────

describe("sessionToEvent", () => {
  const baseSession = {
    sessionType: "bjj",
    sessionDate: "2026-07-06",
    startTime: null as string | null,
    durationMin: null as number | null,
    objective: "",
    notes: "",
    coach: "",
  };

  it("builds an all-day event when there is no start time", () => {
    const ev = sessionToEvent(baseSession, "UTC");
    expect(ev.start).toEqual({ date: "2026-07-06" });
    expect(ev.end).toEqual({ date: "2026-07-07" });
    expect(ev.summary).toBe("Bjj");
    expect(ev.description).toContain("Scheduled in FRAME");
  });

  it("builds a timed event with a computed wall-clock end", () => {
    const ev = sessionToEvent(
      { ...baseSession, startTime: "18:00", durationMin: 90, objective: "Guard retention", coach: "Sam" },
      "America/New_York",
    );
    expect(ev.summary).toBe("Bjj — Guard retention");
    expect(ev.start).toEqual({ dateTime: "2026-07-06T18:00:00", timeZone: "America/New_York" });
    expect(ev.end).toEqual({ dateTime: "2026-07-06T19:30:00", timeZone: "America/New_York" });
    expect(ev.description).toContain("Coach: Sam");
  });

  it("defaults to a 60-minute block when duration is missing", () => {
    const ev = sessionToEvent({ ...baseSession, startTime: "07:00" }, "UTC");
    expect(ev.end).toEqual({ dateTime: "2026-07-06T08:00:00", timeZone: "UTC" });
  });
});
