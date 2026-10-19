import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { parseDismissed, pointersKey, pointersToShow, type PointerId } from "@/lib/pointers";

/**
 * Up to three short, dismissible first-use hints. Each one goes away when dismissed or when the
 * athlete has already done the thing it points to. Original idiom: hairline rows, mono labels.
 */
export function FirstUsePointers({
  userId,
  hasCheckinToday,
  hasEverCheckedIn,
  hasChatted,
  onAction,
}: {
  userId: string | null;
  hasCheckinToday: boolean;
  hasEverCheckedIn: boolean;
  hasChatted: boolean;
  onAction: (id: PointerId) => void;
}) {
  const [dismissed, setDismissed] = useState<PointerId[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    try {
      setDismissed(parseDismissed(localStorage.getItem(pointersKey(userId))));
    } catch {
      setDismissed([]);
    }
  }, [userId]);

  const dismiss = useCallback(
    (id: PointerId) => {
      setDismissed((cur) => {
        const next = [...new Set([...(cur ?? []), id])];
        try {
          if (userId) localStorage.setItem(pointersKey(userId), JSON.stringify(next));
        } catch {
          // storage blocked: dismissed for this visit only
        }
        return next;
      });
    },
    [userId],
  );

  if (dismissed == null) return null;
  const shown = pointersToShow({ dismissed, hasCheckinToday, hasEverCheckedIn, hasChatted });
  if (shown.length === 0) return null;

  return (
    <section className="px-6 pt-7" aria-label="Getting started">
      <div className="border-b border-white/[0.07] pb-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/60">Getting started</h2>
      </div>
      {shown.map((p) => (
        <div key={p.id} className="flex items-start border-b border-white/[0.05]">
          <button
            type="button"
            onClick={() => onAction(p.id)}
            className="flex-1 py-4 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/80">{p.title}</span>
            <span className="mt-1.5 block font-sans font-light text-[13px] leading-relaxed text-foreground/55">{p.body}</span>
            <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.35em] text-primary/80">{p.action}</span>
          </button>
          <button
            type="button"
            onClick={() => dismiss(p.id)}
            aria-label={`Dismiss: ${p.title}`}
            className="mt-3 flex h-8 w-8 flex-none items-center justify-center text-foreground/30 outline-none transition-colors hover:text-foreground/70 focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ))}
    </section>
  );
}
