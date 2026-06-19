import React, {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

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

export function FighterProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { isSignedIn } = useAuth();

  const {
    data: fighter,
    isLoading,
    error,
  } = useQuery<Fighter | null>({
    queryKey: ["fighter"],
    queryFn: async () => {
      try {
        const resp = await apiGet<{ fighter: Fighter | null }>("/fighter");
        return resp.fighter ?? null;
      } catch (e: unknown) {
        const msg = (e as Error).message ?? "";
        if (msg.includes("404") || msg.includes("not found")) return null;
        throw e;
      }
    },
    enabled: !!isSignedIn,
    retry: 1,
    staleTime: 30_000,
  });

  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fighter"] });
  }, [qc]);

  return (
    <FighterContext.Provider
      value={{
        fighter: fighter ?? null,
        isLoading,
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
