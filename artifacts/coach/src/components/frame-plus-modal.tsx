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

// Feature-key → one short contextual reason. Keys match the server's 402
// `feature` field. Kept intentionally terse: it tells the athlete why the card
// opened without competing with the identity statement. "default" has no reason.
const FEATURE_REASON: Record<string, string> = {
  coaching: "You've reached today's coaching limit.",
  analysis_history: "Your past sessions live in FRAME+.",
  weekly_mission: "Your weekly mission is FRAME+.",
  video_analysis: "You've used your free analysis.",
  opponent_analysis: "Opponent scouting is FRAME+.",
  athlete_model: "The complete Athlete Model is FRAME+.",
  fight_readiness: "Advanced readiness is FRAME+.",
  default: "",
};

// The upgrade card sells identity, not a feature list: one manifesto line, then
// three short identity-framed lines. Much less text than a spec sheet.
const IDENTITY = "Train with a model that evolves with you.";
const IDENTITY_LINES = [
  "An evolving athlete model",
  "Unlimited analysis",
  "Continuous calibration",
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
    setFeature(f && f in FEATURE_REASON ? f : "default");
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
  const reason = FEATURE_REASON[feature] ?? "";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to FRAME+"
      onClick={onClose}
    >
      <div
        className="frame-plus-breath w-full max-w-md rounded-t-2xl border bg-[hsl(0,0%,5%)] p-7 pb-9 sm:rounded-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary">
            FRAME+
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1 text-foreground/40 transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {reason !== "" && (
          <p className="mt-6 text-xs tracking-wide text-muted-foreground">
            {reason}
          </p>
        )}

        <h2
          className={`${reason !== "" ? "mt-3" : "mt-8"} max-w-[15ch] text-2xl font-light leading-snug tracking-wide text-foreground/95`}
        >
          {IDENTITY}
        </h2>

        <ul className="mt-8 space-y-3">
          {IDENTITY_LINES.map((line) => (
            <li
              key={line}
              className="flex items-center gap-3 text-[15px] font-light tracking-wide text-foreground/85"
            >
              <span
                aria-hidden
                className="h-px w-5 shrink-0 bg-primary/70"
              />
              {line}
            </li>
          ))}
        </ul>

        {isFramePlus ? (
          <div className="mt-9 border-t border-white/[0.06] pt-5 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
            FRAME+ active — you're covered
          </div>
        ) : (
          <div className="mt-9">
            {priceLabel !== "" && (
              <p className="text-sm font-light tracking-wide text-foreground/70">
                {priceLabel}
              </p>
            )}
            <button
              type="button"
              onClick={startCheckout}
              disabled={checkoutPending}
              className="mt-4 w-full bg-primary py-3.5 font-mono text-[11px] uppercase tracking-[0.3em] text-black transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {checkoutPending ? "Opening checkout" : "Unlock FRAME+"}
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
          </div>
        )}
      </div>
    </div>
  );
}

// Subtle subscriber status marker for headers. Free tier renders NOTHING —
// upgrade entry points are contextual (locked sections, used-up allowances),
// never a permanent button. The Profile membership section carries the only
// standing upsell.
export function FramePlusPill() {
  const { isFramePlus, isLoading } = useSubscription();

  if (isLoading || !isFramePlus) return null;

  return (
    <span className="border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.25em] text-primary">
      FRAME+ active
    </span>
  );
}
