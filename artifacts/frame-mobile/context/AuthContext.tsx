/**
 * Custom auth context — replaces @clerk/clerk-expo.
 * JWT is kept via lib/tokenBackend (SecureStore, AFTER_FIRST_UNLOCK, on a phone; localStorage on
 * the web build) under "frame.token" (web: "frame:token"), and refreshed from the server on every
 * launch so an athlete who keeps opening the app is never forced to sign in again.
 * The saved login is deleted ONLY by an explicit Log out or a real 401 from /auth/refresh — never
 * by offline, 5xx or timeouts, and an unreadable keychain at launch keeps the boot screen up
 * (retrying) instead of routing to sign-in.
 * Provides: isLoaded, isSignedIn, userId, email, getToken, signOut.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import {
  describeStorageError,
  establishSession,
  persistToken,
  refreshSessionToken,
  restoreWithBackoff,
  retryOnce,
  REFRESH_TIMEOUT_MS,
  type RefreshOutcome,
} from "@/lib/authSession";
import { apiUrl } from "@/lib/api";
import { reportStartup } from "@/lib/crashReporter";
import { tokenBackend } from "@/lib/tokenBackend";

/**
 * POST /auth/refresh with the saved token. Throws `{ status }` on an HTTP failure. A request that
 * takes longer than REFRESH_TIMEOUT_MS is aborted; that throws without a status, so it counts as
 * "unavailable" and the login is kept.
 */
async function requestRefresh(token: string): Promise<{ token?: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`refresh ${res.status}`), { status: res.status });
    return (await res.json()) as { token?: unknown };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record a SecureStore/localStorage failure with its real cause, platform and OS version through
 * the startup diagnostics path (crashReporter → server logs). Never includes the token.
 */
function reportStorageError(stage: string, error: unknown, attempt?: number): void {
  const detail = `auth-storage ${stage} failed${attempt ? ` (attempt ${attempt})` : ""} | ${describeStorageError(error)} | os=${Platform.OS} ${String(Platform.Version ?? "?")}`;
  console.warn(`[auth] ${detail}`);
  reportStartup(detail);
}

const MEMORY_ONLY_WARNING =
  "You're signed in for now, but this device couldn't save your login. You may need to sign in again after restarting FRAME.";

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  sessionRestoreError: string | null;
  sessionPersistenceWarning: string | null;
}

interface AuthContextValue extends AuthState {
  getToken: () => Promise<string | null>;
  signIn: (token: string) => Promise<"secure" | "memory-only">;
  signOut: () => Promise<void>;
  dismissSessionPersistenceWarning: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT: AuthState = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  email: null,
  sessionRestoreError: null,
  sessionPersistenceWarning: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...SIGNED_OUT, isLoaded: false });

  // Keep a ref to the raw token so getToken() doesn't need to re-read the store.
  const tokenRef = useRef<string | null>(null);
  // True once auth state is settled for this launch (restored, signed in, or provably signed out).
  const restoredRef = useRef(false);
  // A cold-start restore loop is running; `wakeRef` cuts its current pause short.
  const restoringRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);
  // The current login lives only in memory (every save failed); retried on each foreground.
  const memoryOnlyRef = useRef(false);

  const saveToken = useCallback(async (token: string, stage: string): Promise<boolean> => {
    const ok = await persistToken(token, (t) => tokenBackend.set(t), {
      onError: (e, attempt) => reportStorageError(stage, e, attempt),
    });
    if (ok && memoryOnlyRef.current && tokenRef.current === token) {
      memoryOnlyRef.current = false;
      setState((s) => ({ ...s, sessionPersistenceWarning: null }));
      reportStartup("auth-storage recovered | login saved after memory-only session");
    }
    return ok;
  }, []);

  const refreshInBackground = useCallback(async (token: string) => {
    const outcome: RefreshOutcome = await refreshSessionToken(token, requestRefresh);
    if (tokenRef.current !== token) return; // signed out / replaced meanwhile
    if (outcome.status === "refreshed") {
      tokenRef.current = outcome.token;
      await saveToken(outcome.token, "save-refreshed");
    } else if (outcome.status === "rejected") {
      // A real 401 from /auth/refresh: the account is gone or the token is dead. This and an
      // explicit Log out are the ONLY places the saved login is deleted.
      tokenRef.current = null;
      memoryOnlyRef.current = false;
      await tokenBackend.remove().catch(() => undefined);
      setState({ ...SIGNED_OUT });
    } else {
      // Offline, a 5xx, or a timeout: keep the login, and re-save it so an old item is
      // upgraded to AFTER_FIRST_UNLOCK.
      await saveToken(token, "resave");
    }
  }, [saveToken]);

  const restore = useCallback(async () => {
    if (restoringRef.current || restoredRef.current) {
      wakeRef.current?.(); // a loop is already waiting: try again now
      return;
    }
    restoringRef.current = true;
    let result;
    try {
      result = await restoreWithBackoff(tokenBackend, {
        onError: (e, attempt) => reportStorageError("read", e, attempt),
        shouldStop: () => restoredRef.current,
        sleep: (ms) =>
          new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              if (wakeRef.current === done) wakeRef.current = null;
              resolve();
            };
            const timer = setTimeout(done, ms);
            wakeRef.current = done;
          }),
      });
    } finally {
      restoringRef.current = false;
    }
    if (restoredRef.current) return; // a sign-in beat us to it
    if (result.status === "restored") {
      restoredRef.current = true;
      tokenRef.current = result.token;
      setState({
        ...SIGNED_OUT,
        isSignedIn: true,
        userId: result.identity.sub,
        email: result.identity.email,
      });
      void refreshInBackground(result.token);
    } else if (result.status === "unreadable") {
      // The keychain stayed unreadable for RESTORE_GIVE_UP_AFTER_MS (the boot screen was up the
      // whole time). The saved login is left in place and retried whenever the app returns to
      // the foreground; only now does the "could not be opened" notice show.
      reportStartup("auth-restore gave up | keychain unreadable, showing sign-in");
      setState((s) => ({
        ...s,
        isLoaded: true,
        sessionRestoreError: "Your saved login could not be opened. Please sign in again.",
      }));
    } else {
      // "none" (normal first open) or "invalid" (expired): quietly signed out, no scary message.
      restoredRef.current = true;
      setState((s) => ({ ...s, isLoaded: true, sessionRestoreError: null }));
    }
  }, [refreshInBackground]);

  // Load the saved login on mount. While the keychain is unreadable the boot screen stays up and
  // the read is retried with backoff; returning to the foreground retries at once (the device is
  // unlocked by then). In memory-only mode, the foreground also retries saving the login.
  useEffect(() => {
    void restore();
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (!restoredRef.current) void restore();
      else if (memoryOnlyRef.current && tokenRef.current) void saveToken(tokenRef.current, "save-on-foreground");
    });
    return () => sub.remove();
  }, [restore, saveToken]);

  const getToken = useCallback(async (): Promise<string | null> => {
    return tokenRef.current;
  }, []);

  const signIn = useCallback(async (
    token: string,
  ): Promise<"secure" | "memory-only"> => {
    const { identity, persistence } = await establishSession(
      token,
      {
        setItem: (value) => tokenBackend.set(value),
        deleteItem: () => tokenBackend.remove(),
      },
      { onError: (e, attempt) => reportStorageError("save-sign-in", e, attempt) },
    );

    restoredRef.current = true;
    wakeRef.current?.(); // end any restore loop still waiting on the keychain
    tokenRef.current = token;
    memoryOnlyRef.current = persistence === "memory-only";
    setState({
      isLoaded: true,
      isSignedIn: true,
      userId: identity.sub,
      email: identity.email,
      sessionRestoreError: null,
      sessionPersistenceWarning: persistence === "memory-only" ? MEMORY_ONLY_WARNING : null,
    });
    return persistence;
  }, []);

  const dismissSessionPersistenceWarning = useCallback(() => {
    setState((current) => ({
      ...current,
      sessionPersistenceWarning: null,
    }));
  }, []);

  // Explicit Log out: the only client-initiated deletion of the saved login.
  const signOut = useCallback(async () => {
    tokenRef.current = null;
    memoryOnlyRef.current = false;
    await retryOnce(() => tokenBackend.remove()).catch(() => null);
    setState({ ...SIGNED_OUT });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        getToken,
        signIn,
        signOut,
        dismissSessionPersistenceWarning,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
