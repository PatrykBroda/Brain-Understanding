import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";

// Feature-key → headline copy. Keys match the server's 402 `feature` field.
const FEATURE_COPY: Record<string, { title: string; line: string }> = {
  coaching: {
    title: "You hit today's limit",
    line: "The free tier covers 20 coaching messages a day. FRAME+ removes the cap — the coach stays in your corner all day.",
  },
  analysis_history: {
    title: "Your history is waiting",
    line: "The free tier keeps your latest FRAME REPORT open. FRAME+ unlocks every past session — progress is a pattern, not a snapshot.",
  },
  weekly_mission: {
    title: "The full mission is locked",
    line: "The free tier previews your first mission item. FRAME+ opens the whole week — every item, every rationale, regenerate any time.",
  },
  default: {
    title: "This is a FRAME+ feature",
    line: "FRAME+ removes the free-tier limits across coaching, analysis history and the weekly mission.",
  },
};

const BENEFITS = [
  "Unlimited coaching, every day",
  "Full analysis history and session-over-session comparison",
  "Complete weekly mission with regeneration",
];

type FramePlusContextValue = {
  openUpgrade: (feature?: string) => void;
  closeUpgrade: () => void;
};

const FramePlusContext = createContext<FramePlusContextValue>({
  openUpgrade: () => {},
  closeUpgrade: () => {},
});

export function useFramePlus() {
  return useContext(FramePlusContext);
}

export function FramePlusProvider({ children }: { children: ReactNode }) {
  const [feature, setFeature] = useState<string | null>(null);

  const openUpgrade = useCallback((f?: string) => {
    setFeature(f && f in FEATURE_COPY ? f : "default");
  }, []);
  const closeUpgrade = useCallback(() => setFeature(null), []);

  const value = useMemo(
    () => ({ openUpgrade, closeUpgrade }),
    [openUpgrade, closeUpgrade],
  );

  return (
    <FramePlusContext.Provider value={value}>
      {children}
      {feature !== null && (
        <FramePlusModal feature={feature} onClose={closeUpgrade} />
      )}
    </FramePlusContext.Provider>
  );
}

function FramePlusModal({
  feature,
  onClose,
}: {
  feature: string;
  onClose: () => void;
}) {
  const { priceLabel, startCheckout, checkoutPending, checkoutError, isFramePlus } =
    useSubscription();
  const copy = FEATURE_COPY[feature] ?? FEATURE_COPY["default"]!;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to FRAME+"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-[hsl(0,0%,5%)] p-6 pb-8 sm:rounded-2xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary">
            FRAME+
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1 text-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-4 text-lg font-light tracking-wide text-foreground/95">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {copy.line}
        </p>

        <ul className="mt-5 space-y-2.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-foreground/85">
              <span
                aria-hidden
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary"
              />
              {b}
            </li>
          ))}
        </ul>

        {isFramePlus ? (
          <div className="mt-6 border-t border-white/[0.06] pt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
            FRAME+ active — you're covered
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={startCheckout}
              disabled={checkoutPending}
              className="mt-6 w-full bg-primary py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {checkoutPending
                ? "Opening checkout"
                : priceLabel
                  ? `Upgrade — ${priceLabel}`
                  : "Upgrade to FRAME+"}
            </button>
            {checkoutError != null && (
              <p className="mt-3 text-xs text-destructive">
                Couldn't start checkout. Try again in a moment.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground/80"
            >
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Small entitlement pill for headers. Free tier: tappable, opens the upgrade
// modal. FRAME+: static "FRAME+ ACTIVE" marker.
export function FramePlusPill() {
  const { isFramePlus, isLoading } = useSubscription();
  const { openUpgrade } = useFramePlus();

  if (isLoading) return null;

  if (isFramePlus) {
    return (
      <span className="border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.25em] text-primary">
        FRAME+ active
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openUpgrade()}
      className="border border-white/[0.12] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/70 transition-colors hover:border-primary/50 hover:text-primary"
    >
      FRAME+
    </button>
  );
}
