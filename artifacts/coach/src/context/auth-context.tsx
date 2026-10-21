/**
 * Custom auth context — replaces Clerk.
 * JWT is stored in localStorage under "frame:token" (the native app uses SecureStore "frame.token").
 * The saved login is deleted ONLY by an explicit sign-out or a real 401 from /auth/refresh —
 * never by offline, a 5xx, a timeout, or a 403 (a 403 is a permission answer, not a dead login).
 * Provides: isLoaded, isSignedIn, userId, email, token, signOut.
 * Call setApiTokenGetter once on mount so api.ts can inject the token.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const TOKEN_KEY = "frame:token";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// The iOS Analyse WebView supplies its current FRAME session in memory before
// this app starts. Never persist that bridge token to WebView localStorage.
declare global {
  interface Window {
    __FRAME_MOBILE_TOKEN__?: string;
  }
}

// Capture once at module load so React StrictMode's second effect pass cannot
// fall through to a different user's old WebView localStorage session.
const embeddedToken = typeof window !== "undefined" ? window.__FRAME_MOBILE_TOKEN__ : undefined;
if (typeof window !== "undefined") delete window.__FRAME_MOBILE_TOKEN__;

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (token: string) => void;
  signOut: () => void;
}

function parseToken(token: string): { sub: string; email: string } | null {
  try {
    const [, payloadB64] = token.split(".");
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { sub?: string; email?: string; exp?: number };
    if (!payload.sub || !payload.email) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/** How long POST /auth/refresh may take before it is abandoned (the login is kept). */
const REFRESH_TIMEOUT_MS = 15_000;

/**
 * A localStorage write that fails (private mode, quota, blocked storage) means the login will not
 * survive a reload. Report it rather than swallowing it; never logs the token itself.
 */
function reportStorageError(stage: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.warn(`[auth] localStorage ${stage} failed | ${detail} | ua=${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    email: null,
    token: null,
  });

  // Load token from localStorage on mount.
  useEffect(() => {
    try {
      // An embedded view must never reuse another account's cached web login.
      const raw = embeddedToken || localStorage.getItem(TOKEN_KEY);
      if (raw) {
        const parsed = parseToken(raw);
        if (parsed) {
          setState({
            isLoaded: true,
            isSignedIn: true,
            userId: parsed.sub,
            email: parsed.email,
            token: raw,
          });
          return;
        }
        // Token expired or invalid — clear it.
        if (!embeddedToken) localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      // localStorage blocked / transient read error: leave any saved token in place.
      reportStorageError("read", e);
    }
    setState((s) => ({ ...s, isLoaded: true }));
  }, []);

  // Sliding session: swap the saved token for a fresh one on every load. Only a real 401 signs
  // the user out; offline or a 5xx keeps the login exactly as it is.
  useEffect(() => {
    if (embeddedToken) return;
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      return;
    }
    if (!token || !parseToken(token)) return;
    const sent = token;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    fetch(`${basePath}/api/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sent}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        // Only 401 means the login is dead. 403, 5xx, etc. keep it.
        if (res.status === 401) {
          try {
            if (localStorage.getItem(TOKEN_KEY) === sent) localStorage.removeItem(TOKEN_KEY);
          } catch (e) {
            reportStorageError("remove-after-401", e);
          }
          setState((s) => (s.token === sent ? { isLoaded: true, isSignedIn: false, userId: null, email: null, token: null } : s));
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { token?: unknown };
        if (typeof body.token !== "string" || !parseToken(body.token)) return;
        const fresh = body.token;
        try {
          if (localStorage.getItem(TOKEN_KEY) === sent) localStorage.setItem(TOKEN_KEY, fresh);
        } catch (e) {
          reportStorageError("save-refreshed", e);
        }
        setState((s) => (s.token === sent ? { ...s, token: fresh } : s));
      })
      .catch(() => undefined) // offline / aborted after the timeout: keep the login
      .finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, []);

  const signIn = useCallback((token: string) => {
    const parsed = parseToken(token);
    if (!parsed) return;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      // Signed in for this tab only; the login will not survive a reload.
      reportStorageError("save-sign-in", e);
    }
    setState({
      isLoaded: true,
      isSignedIn: true,
      userId: parsed.sub,
      email: parsed.email,
      token,
    });
  }, []);

  // Explicit sign-out: the only client-initiated deletion of the saved login.
  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      reportStorageError("remove-on-sign-out", e);
    }
    setState({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      email: null,
      token: null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Returns current token synchronously — for use by api.ts token getter. */
export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = parseToken(raw);
    return parsed ? raw : null;
  } catch {
    return null;
  }
}
