import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { VideoBackdrop } from "@/components/media-backdrop";
import { TrainWithFrame } from "@/components/train-with-frame";
import { FrameLogo } from "@/components/frame-logo";

/** The two lines the client requires on every opening surface. */
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
        <div className="flex justify-center"><FrameLogo height={14} /></div>
        <div />
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[460px] flex-col justify-end gap-5 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="frame-rise">
          <TrainWithFrame className={`mx-auto w-full ${compact ? "max-w-[300px]" : "max-w-[400px]"}`} />
          <p className="mt-3 text-center text-base leading-6 text-[var(--f-text-2)]">{SUBLINE}</p>
        </div>
        <div className="frame-rise w-full" style={{ animationDelay: "60ms" }}>
          {children}
        </div>
        <nav aria-label="Legal" className="frame-rise flex items-center justify-center gap-1 text-sm text-[var(--f-text-2)]" style={{ animationDelay: "100ms" }}>
          <a href={`${basePath}/api/terms`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center px-3 underline underline-offset-2 hover:text-foreground">
            Terms
          </a>
          <span aria-hidden>·</span>
          <a href={`${basePath}/api/privacy`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center px-3 underline underline-offset-2 hover:text-foreground">
            Privacy
          </a>
        </nav>
      </main>
    </div>
  );
}
