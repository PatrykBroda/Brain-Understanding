import type { NextFunction, Request, Response } from "express";
import { db, fightersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requestNow } from "../lib/clock";
import { isValidTimeZone, localDate } from "../lib/localTime";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Instant this request is evaluated at (the real clock; injectable in tests). */
      frameNow?: Date;
      /** The timezone sent by the app on this request, when valid. */
      clientTimeZone?: string;
    }
  }
}

/**
 * Reads the athlete's timezone from the `X-Timezone` header the apps send and
 * remembers it on the fighter row, so later server-side work (notifications,
 * jobs) knows which midnight to use. A bad or missing header is ignored.
 */
export function attachTimezone(req: Request, _res: Response, next: NextFunction): void {
  req.frameNow = requestNow(req);
  const raw = req.headers["x-timezone"];
  const tz = Array.isArray(raw) ? raw[0] : raw;
  if (isValidTimeZone(tz)) req.clientTimeZone = tz;
  next();
}

/** The timezone to use for this athlete: this request's header, else what we stored, else UTC. */
export function effectiveTimeZone(req: Pick<Request, "clientTimeZone">, stored: string | null | undefined): string {
  if (req.clientTimeZone) return req.clientTimeZone;
  return isValidTimeZone(stored) ? stored : "UTC";
}

/** The athlete's local date for this request. */
export function todayFor(req: Request, stored: string | null | undefined): string {
  return localDate(req.frameNow ?? new Date(), effectiveTimeZone(req, stored));
}

/** Persist the timezone the app reported if it differs from what is stored (best effort). */
export async function rememberTimezone(
  req: Pick<Request, "clientTimeZone" | "log">,
  fighter: { id: number; timezone: string },
): Promise<void> {
  if (!req.clientTimeZone || req.clientTimeZone === fighter.timezone) return;
  try {
    await db
      .update(fightersTable)
      .set({ timezone: req.clientTimeZone })
      .where(eq(fightersTable.id, fighter.id));
  } catch (err) {
    req.log?.warn({ err }, "could not remember timezone");
  }
}
