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
  video_analysis: "Video analysis is a FRAME+ feature.",
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
  const { isFramePlus } = useSubscription();
  const reason = FEATURE_REASON[feature] ?? "";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#08090B]/75 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to FRAME+"
      onClick={onClose}
    >
      <div
        className="overlay-surface relative w-full max-w-md overflow-hidden !rounded-b-none !rounded-t-[20px] p-6 pb-8 sm:!rounded-[20px] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="chip chip-gold">FRAME+</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="icon-round -mr-1 -mt-1 text-foreground/80 transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {reason !== "" && (
          <p className="mt-5 text-[1rem] text-muted-foreground">{reason}</p>
        )}

        <h2 className={`${reason !== "" ? "mt-2" : "mt-6"} display-title max-w-[16ch]`}>
          {IDENTITY}
        </h2>

        <ul className="mt-6">
          {IDENTITY_LINES.map((line) => (
            <li
              key={line}
              className="flex items-center gap-3 py-3 text-[1rem] text-foreground/90 border-t border-white/[0.06] first:border-t-0"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0 bg-[#B9A477]" />
              {line}
            </li>
          ))}
        </ul>

        {isFramePlus ? (
          <div className="mt-6 border-t border-white/[0.08] pt-5 text-[1rem] font-medium text-[#D4C7A3]">
            FRAME+ active. You are covered.
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-[1rem] leading-[1.6] text-foreground/80">
              FRAME+ is unlocked in the FRAME iOS app. Open the app on your iPhone and subscribe,
              and your FRAME+ access carries across to the web automatically.
            </p>
            <button type="button" onClick={onClose} className="btn-bronze mt-6 w-full">
              Got it
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
    <span className="chip chip-gold whitespace-nowrap">
      FRAME+ active
    </span>
  );
}
