import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";
import type { OrbState } from "@/components/cosmic-orb";

export type FrameStateLabel =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

export interface FrameState {
  label: FrameStateLabel;
  orb: OrbState;
  /** Plain-English source we used to call this state — for honesty in the UI. */
  source: string;
}

/**
 * Interpretive state for the orb + label. No fake biometrics. Every label is
 * either honestly derived from a fact the system has actually recorded, or
 * defaulted to "Stable" / "Dormant". If we can't see signal, we say so.
 *
 * Derivation order (first match wins):
 *   1. no fighter / no convo            → Dormant
 *   2. recent overload/fatigue signal   → Overextended
 *   3. recent rest/recovery signal      → Recovering
 *   4. recent volatility/drift signal   → Volatile
 *   5. recent hesitation/freeze signal  → Tight
 *   6. recent over-intensity signal     → Loaded
 *   7. recent regulation-win signal     → Composed
 *   8. otherwise (fighter + has memory) → Stable
 */
export function useFrameState(): FrameState {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  const memoryQuery = useQuery({
    queryKey: ["memory"],
    queryFn: api.getMemory,
    enabled: !!fighter,
  });

  return useMemo<FrameState>(() => {
    if (!fighter) return { label: "Dormant", orb: "dormant", source: "no fighter loaded" };

    const facts = memoryQuery.data?.facts ?? [];

    if (facts.length === 0) {
      return { label: "Dormant", orb: "dormant", source: "no recorded signal yet" };
    }

    // Look at the most recent ~12 active facts for keyword signal
    const recent = facts.slice(0, 12);
    const blob = recent
      .map((f) => `${f.category} ${f.topic} ${f.content}`.toLowerCase())
      .join(" | ");

    const match = (...patterns: RegExp[]) => patterns.some((re) => re.test(blob));

    if (
      match(
        /overtrain|burn(ed|t)?\s*out|exhaust|depleted|grinding too hard|too many sessions/,
      )
    ) {
      return { label: "Overextended", orb: "overextended", source: "fatigue/overload in recent facts" };
    }
    if (
      match(
        /aftershock|deload|recovery week|rest day|recovering from|injury|coming back|post-?comp/,
      )
    ) {
      return { label: "Recovering", orb: "recovering", source: "recovery/aftershock in recent facts" };
    }
    if (
      match(
        /volatil|emotional leakage|tilt|frustrat|lost composure|spiral|reactive|outburst/,
      )
    ) {
      return { label: "Volatile", orb: "volatile", source: "emotional drift in recent facts" };
    }
    if (
      match(
        /hesitat|freez|stall|second-guess|over-think|paralys|tentative|avoidance/,
      )
    ) {
      return { label: "Tight", orb: "tight", source: "hesitation/avoidance in recent facts" };
    }
    if (
      match(
        /over-?intens|forcing|rushing|approach velocity|over-extended in exchange|too much pressure too early|spammy/,
      )
    ) {
      return { label: "Loaded", orb: "loaded", source: "over-intensity in recent facts" };
    }
    if (
      match(
        /composed|regulated well|stable under|held the frame|breath held|dense calm|locked in cleanly/,
      )
    ) {
      return { label: "Composed", orb: "composed", source: "regulation win in recent facts" };
    }

    return { label: "Stable", orb: "stable", source: "no specific signal — baseline" };
  }, [fighter, memoryQuery.data]);
}
