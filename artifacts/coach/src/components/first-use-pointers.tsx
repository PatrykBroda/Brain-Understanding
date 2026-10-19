import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { parseDismissed, pointersKey, pointersToShow, type PointerId } from "@/lib/pointers";

/**
 * Up to three short, dismissible first-use hints. Each one goes away when dismissed or when the
 * athlete has already done the thing it points to.
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
    <section className="glass w-full overflow-hidden" aria-label="Getting started">
      {shown.map((p) => (
        <div key={p.id} className="flex items-start border-t border-white/[0.06] first:border-t-0">
          <button
            type="button"
            onClick={() => onAction(p.id)}
            className="flex-1 px-5 py-4 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
          >
            <span className="block text-base font-semibold text-foreground">{p.title}</span>
            <span className="mt-1 block text-sm leading-5 text-[var(--f-text-2)]">{p.body}</span>
            <span className="mt-1.5 block text-sm font-medium text-[var(--f-gold-pale)]">{p.action}</span>
          </button>
          <button
            type="button"
            onClick={() => dismiss(p.id)}
            aria-label={`Dismiss: ${p.title}`}
            className="mr-1 mt-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-[12px] text-[var(--f-text-3)] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      ))}
    </section>
  );
}
