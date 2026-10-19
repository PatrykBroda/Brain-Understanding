import { Link } from "wouter";
import { CosmicOrb, type OrbState } from "@/components/cosmic-orb";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { FrameWordmark } from "@/components/frame-wordmark";
import { BottomNav } from "@/components/bottom-nav";
import { Status } from "@/components/frame-ui";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useToday } from "@/hooks/use-today";
import { STATE_CALIBRATION_SENTENCE, STATE_ENTER_LABEL, STATE_LABEL } from "@/lib/state-copy";
import { stateHeadline } from "@/lib/today";

export default function StatePage() {
  useAutoWelcome();

  // The server decides what "today" is; the orb and name follow the athlete's current read.
  const todayQuery = useToday();
  const state = todayQuery.data?.state ?? null;
  const current = !!state?.current && !!state.name;
  const orb: OrbState = (current ? state!.name! : "Dormant").toLowerCase() as OrbState;
  const loading = todayQuery.isLoading;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden text-foreground">
      {/* The ONE atmospheric light on this screen: champagne, behind the orb. Pinned (does not scroll). */}
      <div
        className="atmo atmo-champagne"
        style={{ WebkitMaskImage: "linear-gradient(#000 60%, transparent)", maskImage: "linear-gradient(#000 60%, transparent)" }}
        aria-hidden
      />
      <header className="relative z-10 flex flex-none items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <FrameWordmark size={28} />
        <FramePlusPill />
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-5 pb-6 pt-2">
          <div role="img" aria-label={`State: ${state?.name ?? "Dormant"}`} className="w-[min(66vw,280px)]">
            <CosmicOrb state={orb} className="w-full" />
          </div>

          <div className="mt-4 w-full text-center">
            {loading ? (
              <div className="flex flex-col items-center gap-2" role="status" aria-label="Reading your day">
                <div className="h-10 w-40 rounded-[12px] bg-white/[0.06]" />
              </div>
            ) : todayQuery.isError ? (
              <div className="flex flex-col items-center gap-3">
                <Status tone="red" label="Couldn't load your state" />
                <button type="button" className="btn-quiet" onClick={() => void todayQuery.refetch()}>
                  Try again
                </button>
              </div>
            ) : (
              <>
                <p className="label">{STATE_LABEL}</p>
                <h1 className={`punch punch-xl mt-1 ${current ? "" : "!text-[var(--f-text-3)]"}`}>
                  {state ? stateHeadline(state) : "No read yet"}
                </h1>
                <p className="mt-3 text-base leading-6 text-[var(--f-text-2)]">{STATE_CALIBRATION_SENTENCE}</p>
                {/* Enter is the old primary button under the orb: it opens the coach chat (the app's main surface). */}
                <Link
                  href="/chat"
                  className="btn-bronze mt-6 w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-gold-pale)]"
                >
                  {STATE_ENTER_LABEL}
                </Link>
              </>
            )}
          </div>
        </div>
      </main>

      <div className="relative z-10 flex-none">
        <BottomNav />
      </div>
    </div>
  );
}
