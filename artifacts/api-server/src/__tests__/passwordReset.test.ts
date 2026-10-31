/**
 * Password reset: service rules (hash, expiry, single use, attempt cap), HTTP routes (generic
 * responses, rate limits, password rules), session revocation and the mailer dry-run.
 * Runs against an in-memory ResetStore, so no Postgres is needed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";
import type { AddressInfo } from "node:net";

vi.mock("@workspace/db", () => ({
  db: {},
  usersTable: {},
  passwordResetTokensTable: {},
  FIGHTER_NAME_MAX: 60,
}));

import {
  CODE_RE,
  RESET_CODE_TTL_MINUTES,
  RESET_MAX_ATTEMPTS,
  completePasswordReset,
  generateResetCode,
  hashResetCode,
  requestPasswordReset,
  type ResetDeps,
  type ResetStore,
} from "../lib/passwordReset";
import passwordResetRouter, {
  FORGOT_MESSAGE,
  INVALID_CODE_BODY,
  _forgotEmailStore,
  _forgotIpStore,
  _resetEmailStore,
  _resetIpStore,
  resetRuntime,
} from "../routes/passwordReset";
import { isSessionRevoked } from "../routes/auth";
import {
  _setTransportForTests,
  passwordChangedEmail,
  resetCodeEmail,
  sendMail,
  smtpConfigured,
} from "../lib/mailer";
import type { MailMessage } from "../lib/mailer";

// ─── in-memory store ──────────────────────────────────────────────────────────

interface Tok {
  id: number;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  requestIp: string | null;
}

function makeFake() {
  const users = [{ id: "u1", email: "fighter@example.com", hashedPassword: "old", passwordChangedAt: null as Date | null }];
  const tokens: Tok[] = [];
  let seq = 0;
  const store: ResetStore = {
    async findUserByEmail(email) {
      const u = users.find((x) => x.email === email);
      return u ? { id: u.id, email: u.email } : null;
    },
    async invalidateUnused(userId, now) {
      for (const t of tokens) if (t.userId === userId && !t.usedAt) t.usedAt = now;
    },
    async createToken(t) {
      tokens.push({ id: ++seq, usedAt: null, attempts: 0, ...t });
    },
    async claimAttempt(userId, now) {
      const live = tokens
        .filter((t) => t.userId === userId && !t.usedAt && t.expiresAt > now && t.attempts < RESET_MAX_ATTEMPTS)
        .sort((a, b) => b.id - a.id)[0];
      if (!live) return null;
      live.attempts++;
      return { id: live.id, tokenHash: live.tokenHash };
    },
    async completeReset({ tokenId, userId, hashedPassword, now }) {
      const t = tokens.find((x) => x.id === tokenId);
      if (!t || t.usedAt) return false;
      t.usedAt = now;
      const u = users.find((x) => x.id === userId)!;
      u.hashedPassword = hashedPassword;
      u.passwordChangedAt = now;
      for (const o of tokens) if (o.userId === userId && !o.usedAt) o.usedAt = now;
      return true;
    },
  };
  return { users, tokens, store };
}

/** Pull the 6-digit code out of the captured reset email. */
function codeFrom(m: MailMessage): string {
  return m.text.match(/\n(\d{6})\n/)![1]!;
}

let fake: ReturnType<typeof makeFake>;
let sent: MailMessage[];
let clock: number;
let deps: ResetDeps;

beforeEach(() => {
  fake = makeFake();
  sent = [];
  clock = Date.parse("2026-01-01T00:00:00Z");
  deps = {
    store: fake.store,
    send: async (m) => {
      sent.push(m);
      return { sent: true };
    },
    now: () => new Date(clock),
  };
  resetRuntime.deps = deps;
  resetRuntime.minResponseMs = 0;
  for (const s of [_forgotEmailStore, _forgotIpStore, _resetEmailStore, _resetIpStore]) s.clear();
});

const flush = () => new Promise((r) => setImmediate(r));

// ─── service ──────────────────────────────────────────────────────────────────

describe("reset code + hash", () => {
  it("generates 6-digit codes", () => {
    for (let i = 0; i < 200; i++) expect(generateResetCode()).toMatch(CODE_RE);
  });

  it("hash is deterministic, per-user, and never the raw code", () => {
    const h = hashResetCode("u1", "123456");
    expect(h).toBe(hashResetCode("u1", "123456"));
    expect(h).not.toBe(hashResetCode("u2", "123456"));
    expect(h).not.toContain("123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("requestPasswordReset", () => {
  it("stores only a hash, 30 min expiry, and emails the code", async () => {
    await requestPasswordReset("fighter@example.com", "1.2.3.4", deps);
    await flush();
    expect(fake.tokens).toHaveLength(1);
    const code = codeFrom(sent[0]!);
    expect(fake.tokens[0]!.tokenHash).toBe(hashResetCode("u1", code));
    expect(JSON.stringify(fake.tokens)).not.toContain(code);
    expect(fake.tokens[0]!.expiresAt.getTime() - clock).toBe(RESET_CODE_TTL_MINUTES * 60_000);
    expect(fake.tokens[0]!.requestIp).toBe("1.2.3.4");
    expect(sent[0]!.to).toBe("fighter@example.com");
  });

  it("does nothing (no token, no mail) for an unknown email", async () => {
    await requestPasswordReset("nobody@example.com", null, deps);
    await flush();
    expect(fake.tokens).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("a new request invalidates the older code", async () => {
    await requestPasswordReset("fighter@example.com", null, deps);
    const first = codeFrom(sent[0]!);
    await requestPasswordReset("fighter@example.com", null, deps);
    expect(await completePasswordReset("fighter@example.com", first, "NewPassw0rd!", deps)).toBe(false);
    const second = codeFrom(sent[1]!);
    expect(await completePasswordReset("fighter@example.com", second, "NewPassw0rd!", deps)).toBe(true);
  });

  it("a mail failure does not reject the request", async () => {
    deps.send = async () => {
      throw new Error("smtp down");
    };
    await expect(requestPasswordReset("fighter@example.com", null, deps)).resolves.toBeUndefined();
    await flush();
  });
});

describe("completePasswordReset", () => {
  async function issue() {
    await requestPasswordReset("fighter@example.com", null, deps);
    return codeFrom(sent[0]!);
  }

  it("sets a bcrypt password, stamps password_changed_at, sends notice", async () => {
    const code = await issue();
    expect(await completePasswordReset("fighter@example.com", code, "NewPassw0rd!", deps)).toBe(true);
    const u = fake.users[0]!;
    expect(await bcrypt.compare("NewPassw0rd!", u.hashedPassword)).toBe(true);
    expect(u.passwordChangedAt).toEqual(new Date(clock));
    await flush();
    expect(sent.at(-1)!.subject).toBe(passwordChangedEmail("x").subject);
  });

  it("is single use", async () => {
    const code = await issue();
    expect(await completePasswordReset("fighter@example.com", code, "NewPassw0rd!", deps)).toBe(true);
    expect(await completePasswordReset("fighter@example.com", code, "Another1234!", deps)).toBe(false);
  });

  it("rejects an expired code", async () => {
    const code = await issue();
    clock += RESET_CODE_TTL_MINUTES * 60_000 + 1;
    expect(await completePasswordReset("fighter@example.com", code, "NewPassw0rd!", deps)).toBe(false);
    expect(fake.users[0]!.hashedPassword).toBe("old");
  });

  it("rejects a wrong code, and burns the code after 5 wrong guesses (even the right one then)", async () => {
    const code = await issue();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < RESET_MAX_ATTEMPTS; i++) {
      expect(await completePasswordReset("fighter@example.com", wrong, "NewPassw0rd!", deps)).toBe(false);
    }
    expect(await completePasswordReset("fighter@example.com", code, "NewPassw0rd!", deps)).toBe(false);
    expect(fake.users[0]!.hashedPassword).toBe("old");
  });

  it("4 wrong guesses still leave the right code usable", async () => {
    const code = await issue();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < RESET_MAX_ATTEMPTS - 1; i++) {
      await completePasswordReset("fighter@example.com", wrong, "NewPassw0rd!", deps);
    }
    expect(await completePasswordReset("fighter@example.com", code, "NewPassw0rd!", deps)).toBe(true);
  });

  it("returns false for an unknown email or when no code was requested", async () => {
    expect(await completePasswordReset("nobody@example.com", "123456", "NewPassw0rd!", deps)).toBe(false);
    expect(await completePasswordReset("fighter@example.com", "123456", "NewPassw0rd!", deps)).toBe(false);
  });
});

// ─── routes ───────────────────────────────────────────────────────────────────

async function withServer<T>(fn: (post: (path: string, body: unknown) => Promise<{ status: number; body: any; headers: Headers }>) => Promise<T>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { error() {}, warn() {}, info() {} };
    next();
  });
  app.use(passwordResetRouter);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  try {
    return await fn(post);
  } finally {
    server.close();
  }
}

describe("POST /auth/forgot-password", () => {
  it("returns the identical 200 for a known and an unknown email", async () => {
    await withServer(async (post) => {
      const known = await post("/auth/forgot-password", { email: "Fighter@Example.com" });
      const unknown = await post("/auth/forgot-password", { email: "nobody@example.com" });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
      expect(known.body).toEqual({ ok: true, message: FORGOT_MESSAGE });
      await flush();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe("fighter@example.com");
    });
  });

  it("still returns the generic 200 when the store throws", async () => {
    deps.store = {
      ...fake.store,
      findUserByEmail: async () => {
        throw new Error("db down");
      },
    };
    resetRuntime.deps = deps;
    await withServer(async (post) => {
      const r = await post("/auth/forgot-password", { email: "fighter@example.com" });
      expect(r.status).toBe(200);
      expect(r.body.message).toBe(FORGOT_MESSAGE);
    });
  });

  it("400s on a missing / malformed email", async () => {
    await withServer(async (post) => {
      expect((await post("/auth/forgot-password", {})).status).toBe(400);
      expect((await post("/auth/forgot-password", { email: "nope" })).status).toBe(400);
    });
  });

  it("rate limits per email (3 / 15 min) regardless of account existence", async () => {
    await withServer(async (post) => {
      for (const email of ["fighter@example.com", "nobody@example.com"]) {
        _forgotIpStore.clear();
        for (let i = 0; i < 3; i++) expect((await post("/auth/forgot-password", { email })).status).toBe(200);
        const r = await post("/auth/forgot-password", { email });
        expect(r.status).toBe(429);
        expect(r.headers.get("retry-after")).toBe("900");
      }
    });
  });

  it("rate limits per IP (10 / 15 min)", async () => {
    await withServer(async (post) => {
      for (let i = 0; i < 10; i++) expect((await post("/auth/forgot-password", { email: `u${i}@example.com` })).status).toBe(200);
      expect((await post("/auth/forgot-password", { email: "u99@example.com" })).status).toBe(429);
    });
  });
});

describe("POST /auth/reset-password", () => {
  it("resets with a valid code, then the code is dead", async () => {
    await withServer(async (post) => {
      await post("/auth/forgot-password", { email: "fighter@example.com" });
      await flush();
      const code = codeFrom(sent[0]!);
      const ok = await post("/auth/reset-password", { email: "fighter@example.com", code, newPassword: "NewPassw0rd!" });
      expect(ok).toMatchObject({ status: 200, body: { ok: true } });
      const again = await post("/auth/reset-password", { email: "fighter@example.com", code, newPassword: "NewPassw0rd!" });
      expect(again.status).toBe(400);
      expect(again.body).toEqual(INVALID_CODE_BODY);
    });
  });

  it("gives the same generic 400 for wrong code, unknown email, malformed code", async () => {
    await withServer(async (post) => {
      await post("/auth/forgot-password", { email: "fighter@example.com" });
      const bodies = [
        await post("/auth/reset-password", { email: "fighter@example.com", code: "000000", newPassword: "NewPassw0rd!" }),
        await post("/auth/reset-password", { email: "nobody@example.com", code: "000000", newPassword: "NewPassw0rd!" }),
        await post("/auth/reset-password", { email: "fighter@example.com", code: "abc", newPassword: "NewPassw0rd!" }),
      ];
      for (const b of bodies) {
        expect(b.status).toBe(400);
        expect(b.body).toEqual(INVALID_CODE_BODY);
      }
    });
  });

  it("enforces the sign-up password rules and does not burn the code on a weak password", async () => {
    await withServer(async (post) => {
      await post("/auth/forgot-password", { email: "fighter@example.com" });
      await flush();
      const code = codeFrom(sent[0]!);
      const weak = await post("/auth/reset-password", { email: "fighter@example.com", code, newPassword: "short" });
      expect(weak.status).toBe(400);
      expect(weak.body.code).toBe("INVALID_PASSWORD");
      expect(fake.tokens[0]!.attempts).toBe(0);
      const ok = await post("/auth/reset-password", { email: "fighter@example.com", code, newPassword: "NewPassw0rd!" });
      expect(ok.status).toBe(200);
    });
  });

  it("400s when fields are missing", async () => {
    await withServer(async (post) => {
      expect((await post("/auth/reset-password", { email: "fighter@example.com" })).status).toBe(400);
    });
  });

  it("locks out after 5 wrong guesses through the API", async () => {
    await withServer(async (post) => {
      await post("/auth/forgot-password", { email: "fighter@example.com" });
      await flush();
      const code = codeFrom(sent[0]!);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < RESET_MAX_ATTEMPTS; i++) {
        await post("/auth/reset-password", { email: "fighter@example.com", code: wrong, newPassword: "NewPassw0rd!" });
      }
      const r = await post("/auth/reset-password", { email: "fighter@example.com", code, newPassword: "NewPassw0rd!" });
      expect(r.status).toBe(400);
    });
  });

  it("rate limits per email (10 / 15 min)", async () => {
    await withServer(async (post) => {
      for (let i = 0; i < 10; i++) {
        await post("/auth/reset-password", { email: "fighter@example.com", code: "000000", newPassword: "NewPassw0rd!" });
      }
      const r = await post("/auth/reset-password", { email: "fighter@example.com", code: "000000", newPassword: "NewPassw0rd!" });
      expect(r.status).toBe(429);
    });
  });

  it("500s (not a code error) when the store throws", async () => {
    deps.store = {
      ...fake.store,
      findUserByEmail: async () => {
        throw new Error("db down");
      },
    };
    resetRuntime.deps = deps;
    await withServer(async (post) => {
      const r = await post("/auth/reset-password", { email: "fighter@example.com", code: "123456", newPassword: "NewPassw0rd!" });
      expect(r.status).toBe(500);
    });
  });
});

// ─── session revocation ───────────────────────────────────────────────────────

describe("isSessionRevoked", () => {
  const changed = new Date("2026-01-01T00:00:10Z");
  const changedSec = Math.floor(changed.getTime() / 1000);

  it("never revokes when the password was never changed", () => {
    expect(isSessionRevoked(123, null)).toBe(false);
    expect(isSessionRevoked(null, null)).toBe(false);
  });
  it("revokes tokens issued before the change", () => {
    expect(isSessionRevoked(changedSec - 1, changed)).toBe(true);
  });
  it("keeps tokens issued at or after the change", () => {
    expect(isSessionRevoked(changedSec, changed)).toBe(false);
    expect(isSessionRevoked(changedSec + 100, changed)).toBe(false);
  });
  it("revokes a token with no iat once a change date exists", () => {
    expect(isSessionRevoked(null, changed)).toBe(true);
  });
});

// ─── mailer ───────────────────────────────────────────────────────────────────

describe("mailer", () => {
  it("dry-runs (sent:false, no throw) when SMTP is not configured", async () => {
    const prev = process.env["SMTP_HOST"];
    delete process.env["SMTP_HOST"];
    _setTransportForTests(undefined);
    expect(smtpConfigured()).toBe(false);
    await expect(sendMail(resetCodeEmail("a@b.co", "123456", 30))).resolves.toEqual({ sent: false });
    if (prev !== undefined) process.env["SMTP_HOST"] = prev;
    _setTransportForTests(undefined);
  });

  it("sends through the transport with the FRAME sender when one is set", async () => {
    const sendMailFn = vi.fn().mockResolvedValue({});
    _setTransportForTests({ sendMail: sendMailFn } as any);
    const r = await sendMail(resetCodeEmail("a@b.co", "123456", 30));
    expect(r.sent).toBe(true);
    expect(sendMailFn.mock.calls[0]![0].from).toMatch(/^FRAME </);
    _setTransportForTests(undefined);
  });

  it("templates carry the code in plain + HTML and escape HTML", () => {
    const m = resetCodeEmail("a@b.co", "123456", 30);
    expect(m.text).toContain("123456");
    expect(m.html).toContain("123456");
    expect(m.text).toContain("30 minutes");
    expect(resetCodeEmail("a@b.co", "<b>", 30).html).not.toContain("<b>");
    expect(passwordChangedEmail("a@b.co").text).toMatch(/changed/);
  });
});
