import { MIN_PASSWORD_LENGTH } from "./signUpForm";

export const RESET_CODE_LENGTH = 6;

/** Keep digits only, capped at the code length (handles pasted "123 456"). */
export function sanitizeResetCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, RESET_CODE_LENGTH);
}

export function validateForgotEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  return null;
}

export interface ResetFormErrors {
  code?: string;
  password?: string;
  confirm?: string;
}

export function validateResetForm(input: { code: string; password: string; confirm: string }): ResetFormErrors {
  const errors: ResetFormErrors = {};
  if (sanitizeResetCode(input.code).length !== RESET_CODE_LENGTH) errors.code = `Enter the ${RESET_CODE_LENGTH}-digit code from your email.`;
  if (input.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  else if (input.confirm !== input.password) errors.confirm = "Passwords don't match.";
  return errors;
}
