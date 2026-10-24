import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { formatDay } from "@/lib/local-day";
import { focusBecause, type FocusView, type TodayView } from "@/lib/today";

/**
 * Said when FRAME holds nothing new today (or no check-in): what it knows, from which day,
 * and one clear action. Never dresses an old read up as today's. Shown on Home under
 * Fight Readiness; matches the mobile notice (gold hairlines, plain sentence-case text).
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
    <div role="status" className="border-y border-primary/35 py-3.5">
      <p className="font-sans text-[14px] leading-relaxed text-[#cfcfcf]">
        {disclosure.message}
      </p>
      {disclosure.action === "check_in" && (
        <button
          type="button"
          onClick={onCheckIn}
          className="mt-2.5 inline-flex items-center gap-1.5 font-sans text-[14px] text-primary hover:text-primary/80 transition-colors"
        >
          Check in now
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
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
  const because = focus ? focusBecause(focus) : [];
  return (
    <section className="px-6 pt-7" aria-label="Today's focus">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-2">
        <h2 className="type-label font-medium text-foreground/80">Today's focus</h2>
        {focus?.forDate && (
          <span
            className={`type-meta ${stale ? "text-primary/80" : "text-foreground/80"}`}
          >
            {stale ? `From ${formatDay(focus.forDate)}` : focus.carriedOver ? "Same as yesterday" : "Today"}
          </span>
        )}
      </div>
      {loading ? (
        <p className="pt-4 type-label font-medium text-foreground/80" role="status">
          Reading your day…
        </p>
      ) : focus ? (
        <div className="pt-4">
          <p className={`font-sans font-light text-[1.15rem] leading-snug ${stale ? "text-foreground/60" : "text-foreground/95"}`}>
            {focus.title}
          </p>
          <p className="mt-2 font-sans font-light text-[14px] leading-relaxed text-foreground/80">{focus.detail}</p>
          {because.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-white/[0.05] pt-3">
              {because.map((b) => (
                <li key={b} className="type-meta text-foreground/80 leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          )}
          {!stale && askHref && (
              <Link
                href={askHref(`My focus today is "${focus.title}". Walk me through how to work on it in my next session.`)}
                className="mt-4 inline-flex items-center gap-2 type-meta text-primary/80 hover:text-primary transition-colors"
              >
                Talk it through with your coach
                <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            )}
        </div>
      ) : (
        <p className="pt-4 type-label font-medium text-foreground/80 leading-relaxed">
          Your focus appears here. Log a check-in or tell your coach how training is going.
        </p>
      )}
    </section>
  );
}
