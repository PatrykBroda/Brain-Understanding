type AuthAction = "sign-in" | "sign-up";

type ApiErrorLike = {
  status: number;
  message: string;
  retryAfterSeconds?: number;
};

function isApiError(error: unknown): error is ApiErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { status?: unknown }).status === "number" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /network request failed|network error|timed out|timeout|offline/i.test(
    error.message,
  );
}

export function getAuthErrorMessage(
  error: unknown,
  action: AuthAction,
): string {
  if (isNetworkError(error)) {
    return "We couldn't reach FRAME. Check your connection and try again.";
  }

  if (isApiError(error)) {
    if (error.status === 429) {
      const actionLabel = action === "sign-up" ? "creating an account" : "signing in";
      const waitMinutes = error.retryAfterSeconds
        ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60))
        : null;
      return waitMinutes
        ? `Too many attempts at ${actionLabel}. Please wait about ${waitMinutes} minutes, then try again.`
        : `Too many attempts at ${actionLabel}. Please wait a little while, then try again.`;
    }

    if (error.status === 401 && action === "sign-in") {
      return "Incorrect email or password.";
    }

    if (error.status === 409 && action === "sign-up") {
      return "An account with that email already exists. Try signing in instead.";
    }

    if (error.status === 400) {
      if (/valid email/i.test(error.message)) {
        return "Enter a valid email address.";
      }
      if (/at least 8 characters/i.test(error.message)) {
        return "Your password must be at least 8 characters.";
      }
      if (/email and password required/i.test(error.message)) {
        return "Enter your email and password.";
      }
    }
  }

  if (error instanceof Error && /invalid session/i.test(error.message)) {
    return "We couldn't start your session. Please try again.";
  }

  return action === "sign-up"
    ? "We couldn't create your account right now. Please try again."
    : "We couldn't sign you in right now. Please try again.";
}