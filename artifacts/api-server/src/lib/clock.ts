import type { Request } from "express";

// The one place the server asks "what time is it". Production always answers with
// the real clock. Local and CI runs can move it so the next-day acceptance checks
// (rollover in the athlete's timezone, "nothing new today") are testable without
// waiting a day:
//   - setClockForTests(fn) in unit tests, or
//   - the X-Test-Now header (an ISO instant) when FRAME_ALLOW_TEST_CLOCK=1 and
//     NODE_ENV is not "production". Both are inert in production.

let override: (() => Date) | null = null;

export function setClockForTests(fn: (() => Date) | null): void {
  override = fn;
}

export function now(): Date {
  return override ? override() : new Date();
}

export function testClockEnabled(): boolean {
  return process.env["FRAME_ALLOW_TEST_CLOCK"] === "1" && process.env["NODE_ENV"] !== "production";
}

/** "Now" for this request: the injected test instant if allowed and valid, else the clock. */
export function requestNow(req: Pick<Request, "headers">): Date {
  if (testClockEnabled()) {
    const raw = req.headers["x-test-now"];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === "string") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return new Date(t);
    }
  }
  return now();
}
