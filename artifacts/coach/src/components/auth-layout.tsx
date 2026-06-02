import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto",
        background: "#000",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 30%, hsla(35,65%,55%,0.06) 0%, transparent 55%), radial-gradient(ellipse 95% 55% at 50% 42%, transparent 45%, rgba(0,0,0,0.6) 95%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3">
        <Link
          href="/"
          className="text-foreground/55 hover:text-foreground/90 transition-colors -ml-1"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="font-sans font-extralight text-[14px] tracking-[0.55em] text-foreground/95 leading-none">
            FRAME
          </div>
          <div className="font-mono text-[9px] tracking-[0.5em] text-foreground/45 mt-1.5 font-light">
            MMA · CALIBRATION SYSTEM
          </div>
        </div>
        <div className="w-5" />
      </header>

      <main className="relative z-10 min-h-0 grid place-items-center overflow-y-auto px-5 py-4">
        <div className="frame-auth-in w-full grid place-items-center">{children}</div>
      </main>

      <footer className="relative z-10 px-6 pb-[max(1.6rem,env(safe-area-inset-bottom))] pt-2">
        <p className="mx-auto max-w-sm text-center font-mono text-[9px] leading-relaxed uppercase tracking-[0.3em] text-foreground/40">
          Work email not getting the code? Check spam, or continue with a linked account.
        </p>
      </footer>

      <style>{`
        @keyframes frame-auth-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .frame-auth-in {
          animation: frame-auth-in 0.9s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
}
