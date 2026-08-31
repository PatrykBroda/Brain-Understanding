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
import {
  AuthSessionError,
  establishSession,
  parseSessionToken,
} from "@/lib/authSession";

const TOKEN_KEY = "frame:token";

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  sessionRestoreError: string | null;
}

interface AuthContextValue extends AuthState {
  getToken: () => Promise<string | null>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    email: null,
    sessionRestoreError: null,
  });

  // Keep a ref to the raw token so getToken() doesn't need to re-read SecureStore.
  const tokenRef = useRef<string | null>(null);

  // Load token from SecureStore on mount.
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = parseSessionToken(raw);
          if (parsed) {
            tokenRef.current = raw;
            setState({
              isLoaded: true,
              isSignedIn: true,
              userId: parsed.sub,
              email: parsed.email,
              sessionRestoreError: null,
            });
            return;
          }
          // Expired/invalid — clear it.
          SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
        }
        setState((s) => ({ ...s, isLoaded: true }));
      })
      .catch(() => {
        setState((s) => ({
          ...s,
          isLoaded: true,
          sessionRestoreError:
            "Your saved login could not be opened. Please sign in again.",
        }));
      });
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    return tokenRef.current;
  }, []);

  const signIn = useCallback(async (token: string): Promise<void> => {
    let parsed;
    try {
      parsed = await establishSession(token, {
        setItem: (value) => SecureStore.setItemAsync(TOKEN_KEY, value),
        deleteItem: () => SecureStore.deleteItemAsync(TOKEN_KEY),
      });
    } catch (error) {
      if (error instanceof AuthSessionError && error.reason === "storage") {
        console.error("Failed to persist mobile auth session", error);
      }
      throw error;
    }

    tokenRef.current = token;
    setState({
      isLoaded: true,
      isSignedIn: true,
      userId: parsed.sub,
      email: parsed.email,
      sessionRestoreError: null,
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
      sessionRestoreError: null,
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
