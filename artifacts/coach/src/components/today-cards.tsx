import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { formatDay } from "@/lib/local-day";
import type { FocusView, TodayView } from "@/lib/today";

/**
 * Said when FRAME holds nothing new today (or no check-in): what it knows, from which day,
 * and one clear action. Never dresses an old read up as today's. Original idiom: mono
 * spaced-uppercase labels on hairline rows.
 */
export function DisclosureNotice({
  disclosure,
  onCheckIn,
}: {
  disclosure: TodayView["disclosure"];
  onCheckIn: () => void;
}) {
  if (disclosure.code === "none") return null;
  return (
    <div role="status" className="border-y border-white/[0.07] py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/55 leading-relaxed">
        {disclosure.message}
      </p>
      {disclosure.action === "check_in" && (
        <button
          type="button"
          onClick={onCheckIn}
          className="mt-3 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.35em] text-primary/80 hover:text-primary transition-colors"
        >
          Check in now
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

/** Today's Focus: one thing, why, and which day it belongs to. */
export function FocusSection({
  focus,
  loading,
  askHref,
}: {
  focus: FocusView | null;
  loading?: boolean;
  /** Builds the chat link that opens the coach with a prompt ready to send. */
  askHref?: (prompt: string) => string;
}) {
  const stale = focus != null && !focus.current;
  return (
    <section className="px-6 pt-7" aria-label="Today's focus">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/60">Today's focus</h2>
        {focus?.forDate && (
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.3em] ${stale ? "text-primary/80" : "text-foreground/35"}`}
          >
            {stale ? `From ${formatDay(focus.forDate)}` : focus.carriedOver ? "Same as yesterday" : "Today"}
          </span>
        )}
      </div>
      {loading ? (
        <p className="pt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35" role="status">
          Reading your day…
        </p>
      ) : focus ? (
        <div className="pt-4">
          <p className={`font-sans font-light text-[1.15rem] leading-snug ${stale ? "text-foreground/60" : "text-foreground/95"}`}>
            {focus.title}
          </p>
          <p className="mt-2 font-sans font-light text-[14px] leading-relaxed text-foreground/60">{focus.detail}</p>
          {focus.because.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-white/[0.05] pt-3">
              {focus.because.map((b) => (
                <li key={b} className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          )}
          {stale ? (
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.25em] text-primary/80 leading-relaxed">
              Not set for today. Check in or tell your coach how training went and FRAME will set today's.
            </p>
          ) : (
            askHref && (
              <Link
                href={askHref(`My focus today is "${focus.title}". Walk me through how to work on it in my next session.`)}
                className="mt-4 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.35em] text-primary/80 hover:text-primary transition-colors"
              >
                Talk it through with your coach
                <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            )
          )}
        </div>
      ) : (
        <p className="pt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35 leading-relaxed">
          Your focus appears here. Log a check-in or tell your coach how training is going.
        </p>
      )}
    </section>
  );
}
