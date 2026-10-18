export const MIN_PASSWORD_LENGTH = 8;

export type SignUpFormErrors = {
  email?: string;
  password?: string;
  legal?: string;
};

/** Looks like name@domain.tld; the server only checks for "@", this catches the common typos early. */
export function isPlausibleEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/**
 * What is still missing from the sign-up form, in plain words. The button used
 * to stay greyed out with no hint (and a bad email only failed after the
 * athlete had read the whole AI-consent screen and tapped Agree).
 */
export function validateSignUp(input: {
  email: string;
  password: string;
  acceptedLegal: boolean;
}): SignUpFormErrors {
  const errors: SignUpFormErrors = {};
  if (!input.email.trim()) errors.email = "Enter your email.";
  else if (!isPlausibleEmail(input.email)) errors.email = "That email doesn't look right. Check it for typos.";
  if (!input.password) errors.password = "Choose a password.";
  else if (input.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!input.acceptedLegal) errors.legal = "Tick the box to accept the Terms and Privacy Policy.";
  return errors;
}

export const hasSignUpErrors = (e: SignUpFormErrors) => Object.keys(e).length > 0;
