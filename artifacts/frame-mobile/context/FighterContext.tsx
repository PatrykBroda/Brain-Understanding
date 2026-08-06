import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { reportStartup } from "@/lib/crashReporter";

export interface Fighter {
  id: number;
  userId: string;
  name: string;
  age: number | null;
  dateOfBirth: string | null;
  art: string | null;
  primarySport: string | null;
  level: string | null;
  trainingFrequency: string | null;
  heightCm: number | null;
  weightKg: number | null;
  gym: string | null;
  personality: string | null;
  goals: string | null;
  weaknesses: string | null;
  spiritAnimal: string | null;
  spiritAnimalTagline: string | null;
  archetype: string | null;
  vocabularyLevel: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FighterContextValue {
  fighter: Fighter | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const FighterContext = createContext<FighterContextValue | null>(null);

// Cache is scoped per user so one athlete can never see another's
// profile on a shared device.
const cacheKeyFor = (userId: string) => `frame:fighter-cache:${userId}`;
const FETCH_TIMEOUT_MS = 15_000;

// Report the first fighter fetch (success or failure) exactly once per launch.
let firstFetchReported = false;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Request timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function FighterProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { isSignedIn, userId } = useAuth();

  // Last-known fighter from disk: undefined = still reading, null = no cache.
  // Keyed by the signed-in user; reset whenever the auth identity changes.
  const [cached, setCached] = useState<Fighter | null | undefined>(undefined);
  useEffect(() => {
    setCached(undefined);
    if (!userId) {
      setCached(null);
      return;
    }
    let alive = true;
    AsyncStorage.getItem(cacheKeyFor(userId))
      .then((raw) => {
        if (!alive) return;
        const parsed = raw ? (JSON.parse(raw) as Fighter) : null;
        // Belt and braces: only trust a cache entry written for this user.
        setCached(parsed && parsed.userId === userId ? parsed : null);
      })
      .catch(() => alive && setCached(null));
    return () => {
      alive = false;
    };
  }, [userId]);

  const {
    data: fighter,
    isLoading,
    error,
  } = useQuery<Fighter | null>({
    queryKey: ["fighter", userId],
    queryFn: async () => {
      const started = Date.now();
      try {
        const resp = await withTimeout(
          apiGet<{ fighter: Fighter | null }>("/fighter"),
          FETCH_TIMEOUT_MS,
        );
        if (!firstFetchReported) {
          firstFetchReported = true;
          reportStartup(`fighter-fetch-ok | took=${Date.now() - started}ms`);
        }
        return resp.fighter ?? null;
      } catch (e: unknown) {
        const msg = (e as Error).message ?? "";
        if (!firstFetchReported) {
          firstFetchReported = true;
          reportStartup(
            `fighter-fetch-failed | took=${Date.now() - started}ms | ${msg.slice(0, 120)}`,
          );
        }
        if (msg.includes("404") || msg.includes("not found")) return null;
        throw e;
      }
    },
    enabled: !!isSignedIn,
    retry: 1,
    staleTime: 30_000,
  });

  // Persist the latest server answer so the next cold start renders instantly.
  useEffect(() => {
    if (fighter === undefined || !userId) return;
    if (fighter === null) {
      AsyncStorage.removeItem(cacheKeyFor(userId)).catch(() => null);
    } else {
      AsyncStorage.setItem(cacheKeyFor(userId), JSON.stringify(fighter)).catch(
        () => null,
      );
    }
  }, [fighter, userId]);

  // While the network fetch is in flight, fall back to the cached profile so
  // returning athletes aren't stuck behind a spinner; the query refreshes in
  // the background and replaces it when it settles.
  const effectiveFighter =
    fighter !== undefined ? (fighter ?? null) : (cached ?? null);
  const effectiveLoading =
    isLoading && !(cached && fighter === undefined);

  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fighter", userId] });
  }, [qc, userId]);

  return (
    <FighterContext.Provider
      value={{
        fighter: effectiveFighter,
        isLoading: effectiveLoading,
        error: error as Error | null,
        refetch,
      }}
    >
      {children}
    </FighterContext.Provider>
  );
}

export function useFighter() {
  const ctx = useContext(FighterContext);
  if (!ctx) throw new Error("useFighter must be used inside FighterProvider");
  return ctx;
}
