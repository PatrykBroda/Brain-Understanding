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
      const raw = localStorage.getItem(TOKEN_KEY);
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
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // localStorage blocked
    }
    setState((s) => ({ ...s, isLoaded: true }));
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
