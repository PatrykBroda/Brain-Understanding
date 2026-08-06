/**
 * Custom auth context for the mobile app — replaces @clerk/clerk-expo.
 * JWT is stored in SecureStore under "frame:token".
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
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "frame:token";

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
}

interface AuthContextValue extends AuthState {
  getToken: () => Promise<string | null>;
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
}

function parseToken(token: string): { sub: string; email: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadB64 = parts[1]!;
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
  });

  // Keep a ref to the raw token so getToken() doesn't need to re-read SecureStore.
  const tokenRef = useRef<string | null>(null);

  // Load token from SecureStore on mount.
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = parseToken(raw);
          if (parsed) {
            tokenRef.current = raw;
            setState({
              isLoaded: true,
              isSignedIn: true,
              userId: parsed.sub,
              email: parsed.email,
            });
            return;
          }
          // Expired/invalid — clear it.
          SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
        }
        setState((s) => ({ ...s, isLoaded: true }));
      })
      .catch(() => {
        setState((s) => ({ ...s, isLoaded: true }));
      });
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    return tokenRef.current;
  }, []);

  const signIn = useCallback((token: string) => {
    const parsed = parseToken(token);
    if (!parsed) return;
    tokenRef.current = token;
    SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => null);
    setState({
      isLoaded: true,
      isSignedIn: true,
      userId: parsed.sub,
      email: parsed.email,
    });
  }, []);

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
    setState({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      email: null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, getToken, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
