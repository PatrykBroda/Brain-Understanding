import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";

/**
 * Fires POST /api/coach/welcome the moment a fighter is loaded. Safe to mount
 * on multiple pages (Home + Chat) — the server uses a pg advisory lock plus a
 * post-acquire recheck, so concurrent or repeated triggers no-op cleanly and
 * only one welcome ever lands.
 */
export function useAutoWelcome() {
  const qc = useQueryClient();
  const { data: fighterData, isLoading } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const firedFor = useRef<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.postWelcome(),
    onSuccess: (data) => {
      if (data.message) {
        qc.invalidateQueries({ queryKey: ["conversation"] });
      }
    },
  });

  useEffect(() => {
    if (isLoading || !fighter) return;
    if (firedFor.current === fighter.id) return;
    firedFor.current = fighter.id;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, fighter?.id]);
}
