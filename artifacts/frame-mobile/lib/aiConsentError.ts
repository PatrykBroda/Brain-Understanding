import { ApiError } from "./api";

export type AiConsentLoadErrorCopy = {
  title: string;
  message: string;
  action: "retry" | "sign-in";
};

export function aiConsentLoadErrorCopy(
  error: unknown,
): AiConsentLoadErrorCopy {
  if (error instanceof ApiError && error.status === 401) {
    return {
      title: "Session expired",
      message: "Please sign in again to load your permissions.",
      action: "sign-in",
    };
  }

  if (error instanceof ApiError && error.status >= 500) {
    return {
      title: "FRAME is temporarily unavailable",
      message: "We couldn’t verify your permissions. Please try again shortly.",
      action: "retry",
    };
  }

  if (error instanceof TypeError) {
    return {
      title: "Connection problem",
      message: "Could not reach FRAME. Check your connection and try again.",
      action: "retry",
    };
  }

  return {
    title: "Could not verify permissions",
    message: "FRAME couldn’t confirm your permission status. Please try again.",
    action: "retry",
  };
}
