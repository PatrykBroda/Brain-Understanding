/**
 * Custom auth context — replaces Clerk.
 * JWT is stored in localStorage under "frame:token".
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
    } catch {
      // localStorage blocked / transient read error: leave any saved token in place.
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
    fetch(`${basePath}/api/auth/refresh`, { method: "POST", headers: { Authorization: `Bearer ${sent}` } })
      .then(async (res) => {
        if (res.status === 401) {
          try {
            if (localStorage.getItem(TOKEN_KEY) === sent) localStorage.removeItem(TOKEN_KEY);
          } catch {
            // ignore
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
        } catch {
          // ignore
        }
        setState((s) => (s.token === sent ? { ...s, token: fresh } : s));
      })
      .catch(() => undefined);
  }, []);

  const signIn = useCallback((token: string) => {
    const parsed = parseToken(token);
    if (!parsed) return;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore storage errors
    }
    setState({
      isLoaded: true,
      isSignedIn: true,
      userId: parsed.sub,
      email: parsed.email,
      token,
    });
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
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
