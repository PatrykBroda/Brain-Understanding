/**
 * Custom auth context — replaces @clerk/clerk-expo.
 * JWT is kept via lib/tokenBackend (SecureStore, AFTER_FIRST_UNLOCK, on a phone; localStorage on
 * the web build) under "frame.token", and refreshed from the server on every launch so an
 * athlete who keeps opening the app is never forced to sign in again.
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
import { AppState } from "react-native";
import {
  establishSession,
  refreshSessionToken,
  restoreSession,
  retryOnce,
  type RefreshOutcome,
} from "@/lib/authSession";
import { apiUrl } from "@/lib/api";
import { tokenBackend } from "@/lib/tokenBackend";

/** POST /auth/refresh with the saved token. Throws `{ status }` on an HTTP failure. */
async function requestRefresh(token: string): Promise<{ token?: unknown }> {
  const res = await fetch(apiUrl("/auth/refresh"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw Object.assign(new Error(`refresh ${res.status}`), { status: res.status });
  return (await res.json()) as { token?: unknown };
}

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
  const restoredRef = useRef(false);

  const refreshInBackground = useCallback(async (token: string) => {
    const outcome: RefreshOutcome = await refreshSessionToken(token, requestRefresh);
    if (tokenRef.current !== token) return; // signed out / replaced meanwhile
    if (outcome.status === "refreshed") {
      tokenRef.current = outcome.token;
      await retryOnce(() => tokenBackend.set(outcome.token)).catch(() => undefined);
    } else if (outcome.status === "rejected") {
      // A real 401 from the server: the account is gone or the token is dead.
      tokenRef.current = null;
      await tokenBackend.remove().catch(() => undefined);
      setState({ ...SIGNED_OUT });
    } else {
      // Offline or a server hiccup: keep the login, and re-save it so an old item is
      // upgraded to AFTER_FIRST_UNLOCK.
      await retryOnce(() => tokenBackend.set(token)).catch(() => undefined);
    }
  }, []);

  const restore = useCallback(async () => {
    const result = await restoreSession(tokenBackend);
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
      // Storage failed twice. The saved login is left in place (retried when the app returns to
      // the foreground); this is the only case that shows the "could not be opened" notice.
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

  // Load the saved login on mount; if the keychain was unreadable, try again whenever the app
  // comes back to the foreground (the device is unlocked by then).
  useEffect(() => {
    void restore();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && !restoredRef.current) void restore();
    });
    return () => sub.remove();
  }, [restore]);

  const getToken = useCallback(async (): Promise<string | null> => {
    return tokenRef.current;
  }, []);

  const signIn = useCallback(async (
    token: string,
  ): Promise<"secure" | "memory-only"> => {
    const { identity, persistence } = await establishSession(token, {
      setItem: (value) => tokenBackend.set(value),
      deleteItem: () => tokenBackend.remove(),
    });

    restoredRef.current = true;
    tokenRef.current = token;
    setState({
      isLoaded: true,
      isSignedIn: true,
      userId: identity.sub,
      email: identity.email,
      sessionRestoreError: null,
      sessionPersistenceWarning:
        persistence === "memory-only"
          ? "You're signed in for now, but this device couldn't save your login. You may need to sign in again after restarting FRAME."
          : null,
    });
    return persistence;
  }, []);

  const dismissSessionPersistenceWarning = useCallback(() => {
    setState((current) => ({
      ...current,
      sessionPersistenceWarning: null,
    }));
  }, []);

  const signOut = useCallback(async () => {
    tokenRef.current = null;
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
