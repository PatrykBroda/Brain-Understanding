import type { Request, Response, RequestHandler } from "express";
import type { ZodType } from "zod/v4";

/** A deliberate, client-visible failure: status + stable machine code + short message. */
export class JuniorError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

/** Wrap an async handler: JuniorError becomes `{ error, code, ...extra }`; anything else goes to the error handler. */
export function h(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof JuniorError) {
        res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra ?? {}) });
        return;
      }
      next(err);
    });
  };
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new JuniorError(400, "INVALID_BODY", r.error.issues[0]?.message ?? "Invalid request", {
      field: r.error.issues[0]?.path.join("."),
    });
  }
  return r.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route param that must be a UUID; anything else is a 404 (never reaches the DB, never leaks). */
export function uuidParam(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new JuniorError(404, "NOT_FOUND", "Not found");
  return v.toLowerCase();
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function userId(req: Request): string {
  if (!req.userId) throw new JuniorError(401, "UNAUTHORIZED", "Unauthorized");
  return req.userId;
}

export function nowOf(req: Request): Date {
  return req.frameNow ?? new Date();
}
