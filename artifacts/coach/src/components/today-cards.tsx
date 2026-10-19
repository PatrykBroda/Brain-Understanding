import { ArrowUpRight, Clock, Info } from "lucide-react";
import { Link } from "wouter";
import { formatDay } from "@/lib/local-day";
import type { FocusView, TodayView } from "@/lib/today";

/**
 * Said when FRAME holds nothing new today (or no check-in): what it knows, from which day,
 * and one clear action. Never dresses an old read up as today's.
 */
export function DisclosureNotice({
  disclosure,
  onCheckIn,
}: {
  disclosure: TodayView["disclosure"];
  onCheckIn: () => void;
}) {
  if (disclosure.code === "none") return null;
  const stale = disclosure.code === "no_info_today" || disclosure.code === "no_info_ever";
  const Icon = stale ? Clock : Info;
  return (
    <div
      role="status"
      className={`glass w-full px-4 py-4 text-left ${stale ? "border-[rgba(185,164,119,0.28)]" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-[18px] w-[18px] flex-none ${stale ? "text-[var(--f-gold-pale)]" : "text-[var(--f-text-2)]"}`} strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] leading-[1.45] text-foreground">{disclosure.message}</p>
          {disclosure.action === "check_in" && (
            <button type="button" onClick={onCheckIn} className="btn-quiet mt-3">
              Check in now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Today's Focus: one thing, why, and which day it belongs to. */
export function FocusCard({
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
    <section className="glass w-full px-5 py-5 text-left" aria-label="Today's focus">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Today&apos;s focus</span>
        {focus?.forDate && (
          <span
            className={`tnum rounded-full border px-2.5 py-0.5 text-xs ${
              stale
                ? "border-[rgba(185,164,119,0.28)] bg-[rgba(185,164,119,0.10)] text-[var(--f-gold-pale)]"
                : "border-[var(--f-border)] bg-[var(--f-raised)] text-[var(--f-text-2)]"
            }`}
          >
            {stale ? `From ${formatDay(focus.forDate)}` : focus.carriedOver ? "Same as yesterday" : "Today"}
          </span>
        )}
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-[var(--f-text-3)]" role="status">
          Reading your day…
        </p>
      ) : focus ? (
        <>
          <h3 className={`section-title mt-2.5 ${stale ? "!text-[var(--f-text-2)]" : ""}`}>{focus.title}</h3>
          <p className="mt-1.5 text-[0.9375rem] leading-[1.5] text-[var(--f-text-2)]">{focus.detail}</p>
          {focus.because.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-[var(--f-hairline)] pt-3">
              {focus.because.map((b) => (
                <li key={b} className="text-[0.8125rem] leading-[1.4] text-[var(--f-text-3)]">
                  {b}
                </li>
              ))}
            </ul>
          )}
          {stale ? (
            <p className="mt-3 text-[0.8125rem] leading-[1.4] text-[var(--f-gold-pale)]">
              Not set for today. Check in or tell your coach how training went and FRAME will set today&apos;s.
            </p>
          ) : (
            askHref && (
              <Link
                href={askHref(`My focus today is "${focus.title}". Walk me through how to work on it in my next session.`)}
                className="mt-3.5 flex min-h-[44px] items-center justify-between rounded-[12px] border border-[var(--f-border)] px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
              >
                Talk it through with your coach
                <ArrowUpRight className="h-4 w-4 text-[var(--f-text-2)]" strokeWidth={1.75} aria-hidden />
              </Link>
            )
          )}
        </>
      ) : (
        <>
          <h3 className="section-title mt-2.5">Your focus appears here</h3>
          <p className="mt-1.5 text-[0.9375rem] leading-[1.5] text-[var(--f-text-2)]">
            Log a check-in or tell your coach how training is going. FRAME sets a focus from what it knows about your day.
          </p>
        </>
      )}
    </section>
  );
}
