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
  sessionPersistenceWarning: string | null;
}

interface AuthContextValue extends AuthState {
  getToken: () => Promise<string | null>;
  signIn: (token: string) => Promise<"secure" | "memory-only">;
  signOut: () => Promise<void>;
  dismissSessionPersistenceWarning: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    email: null,
    sessionRestoreError: null,
    sessionPersistenceWarning: null,
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
              sessionPersistenceWarning: null,
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

  const signIn = useCallback(async (
    token: string,
  ): Promise<"secure" | "memory-only"> => {
    const { identity, persistence } = await establishSession(token, {
      setItem: (value) => SecureStore.setItemAsync(TOKEN_KEY, value),
      deleteItem: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    });

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
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
    setState({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      email: null,
      sessionRestoreError: null,
      sessionPersistenceWarning: null,
    });
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
