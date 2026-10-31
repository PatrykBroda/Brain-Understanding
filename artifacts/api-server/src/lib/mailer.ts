/**
 * Transactional email (password reset). nodemailer over SMTP, configured only
 * from env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM.
 * With no SMTP_HOST the mailer is a dry-run: it logs that a message would have
 * been sent (recipient + subject only, never the body, which holds the code)
 * and resolves, so dev and tests never need a mail server.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  sent: boolean; // false = dry-run
}

const DEFAULT_FROM = "FRAME <admin@framemma.ai>";

export function mailFrom(): string {
  return process.env["MAIL_FROM"] || DEFAULT_FROM;
}

export function smtpConfigured(): boolean {
  return Boolean(process.env["SMTP_HOST"]);
}

/** Build a transporter from env, or null when SMTP is not configured. */
export function createTransport(): Transporter | null {
  const host = process.env["SMTP_HOST"];
  if (!host) return null;
  const port = Number(process.env["SMTP_PORT"] || 465);
  const secureEnv = process.env["SMTP_SECURE"];
  // 465 is implicit TLS; anything else (587) upgrades with STARTTLS.
  const secure = secureEnv ? secureEnv === "true" || secureEnv === "1" : port === 465;
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

let cached: Transporter | null | undefined;
let override: Transporter | null | undefined;

/** Test hook: inject a transporter (or null for dry-run); call with undefined to reset. */
export function _setTransportForTests(t: Transporter | null | undefined): void {
  override = t;
  cached = undefined;
}

function transport(): Transporter | null {
  if (override !== undefined) return override;
  if (cached === undefined) cached = createTransport();
  return cached;
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const t = transport();
  if (!t) {
    logger.info({ to: msg.to, subject: msg.subject }, "mailer dry-run: SMTP not configured, email not sent");
    return { sent: false };
  }
  await t.sendMail({ from: mailFrom(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  return { sent: true };
}

// ─── Templates ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0b0c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#151517;border-radius:12px;padding:32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e8e8ea;">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:6px;color:#ffffff;padding-bottom:24px;">FRAME</td></tr>
<tr><td style="font-size:18px;font-weight:600;color:#ffffff;padding-bottom:12px;">${escapeHtml(title)}</td></tr>
<tr><td style="font-size:15px;line-height:22px;color:#c9c9cd;">${bodyHtml}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function resetCodeEmail(to: string, code: string, ttlMinutes: number): MailMessage {
  const subject = "Your FRAME password reset code";
  const text = [
    "Use this code to reset your FRAME password:",
    "",
    code,
    "",
    `It expires in ${ttlMinutes} minutes and can only be used once.`,
    "If you didn't ask to reset your password, you can ignore this email — your password won't change.",
    "",
    "FRAME",
  ].join("\n");
  const html = layout(
    "Reset your password",
    `<p style="margin:0 0 16px;">Use this code to reset your FRAME password:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#ffffff;">${escapeHtml(code)}</p>
<p style="margin:0 0 16px;">It expires in ${ttlMinutes} minutes and can only be used once.</p>
<p style="margin:0;color:#8e8e93;">If you didn't ask to reset your password, you can ignore this email — your password won't change.</p>`,
  );
  return { to, subject, text, html };
}

export function passwordChangedEmail(to: string): MailMessage {
  const subject = "Your FRAME password was changed";
  const text = [
    "The password for your FRAME account was just changed, and you've been signed out on your other devices.",
    "",
    "If this was you, there's nothing more to do.",
    "If it wasn't, reset your password again from the sign-in screen right away.",
    "",
    "FRAME",
  ].join("\n");
  const html = layout(
    "Your password was changed",
    `<p style="margin:0 0 16px;">The password for your FRAME account was just changed, and you've been signed out on your other devices.</p>
<p style="margin:0 0 16px;">If this was you, there's nothing more to do.</p>
<p style="margin:0;color:#8e8e93;">If it wasn't, reset your password again from the sign-in screen right away.</p>`,
  );
  return { to, subject, text, html };
}
