import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { VideoBackdrop } from "@/components/media-backdrop";

/** The two lines the client requires on every opening surface. */
export const TAGLINE = "Your corner team between training sessions.";
export const SUBLINE = "AI coaching for fighters and athletes.";

/**
 * Opening surface for sign-in / sign-up: monochrome athlete imagery (video, poster
 * for reduced-motion) under a dark scrim, a reserved text band for the tagline,
 * and one form card. The imagery is the only atmospheric light here.
 */
export default function AuthLayout({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className="relative grid h-[100dvh] overflow-hidden bg-[var(--f-bg)] text-foreground"
      style={{ gridTemplateRows: "auto minmax(0,1fr)" }}
    >
      <VideoBackdrop dim={0.3} />

      <header className="relative z-10 grid grid-cols-[44px_1fr_44px] items-center px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <Link href="/" className="icon-round" aria-label="Back">
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <div className="wordmark text-center text-[1.05rem]">Frame</div>
        <div />
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[460px] flex-col justify-end gap-5 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="frame-rise">
          <h2 className={`punch ${compact ? "text-[1.75rem]" : "punch-l"} text-balance`}>{TAGLINE}</h2>
          <p className="mt-2 text-base leading-6 text-[var(--f-text-2)]">{SUBLINE}</p>
        </div>
        <div className="frame-rise w-full" style={{ animationDelay: "60ms" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
