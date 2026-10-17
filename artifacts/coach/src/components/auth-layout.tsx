import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import loginHero from "@/assets/login-hero.jpg";

// Film-grain layer: inline SVG turbulence noise, tiled. Pure decoration.
const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>`,
)}")`;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="frame-ambient relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      {/* Combat photo, pushed back into the graphite: monochrome, luminosity-blended
          so it reads as texture and depth rather than a flat picture. */}
      <img
        src={loginHero}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-[center_28%] pointer-events-none select-none z-0 mix-blend-luminosity"
        style={{ filter: "grayscale(1) contrast(1.05)", opacity: 0.3 }}
      />
      {/* Graphite wash: dark at the edges and floor, open at the core so the card glows */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.35) 40%, rgba(5,5,5,0.92) 100%), radial-gradient(ellipse 95% 60% at 50% 40%, transparent 30%, rgba(5,5,5,0.6) 100%)",
        }}
      />
      {/* Film grain */}
      <div
        className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay"
        style={{ backgroundImage: GRAIN_URI, backgroundSize: "160px 160px", opacity: 0.12 }}
      />
      {/* Bronze + crimson glow fields */}
      <div aria-hidden className="glow-orb z-0 -top-24 right-[-6rem] h-[22rem] w-[22rem]" />
      <div
        aria-hidden
        className="glow-orb z-0 bottom-[-8rem] left-[-7rem] h-[20rem] w-[20rem]"
        style={{ background: "radial-gradient(circle, rgba(191,29,29,0.30), transparent 70%)" }}
      />

      <header className="relative z-10 grid grid-cols-[44px_1fr_44px] items-center px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <Link
          href="/"
          className="icon-round text-foreground/85 transition-colors hover:text-foreground"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="font-display text-[1.7rem] leading-none text-[#f1ede6]">Frame</div>
          <div className="eyebrow mt-1.5 !text-[10px]">MMA · Calibration system</div>
        </div>
        <div />
      </header>

      <main className="relative z-10 min-h-0 grid place-items-center overflow-y-auto px-5 py-4">
        <div className="frame-auth-in w-full grid place-items-center">{children}</div>
      </main>

      <footer className="relative z-10 px-6 pb-[max(1.6rem,env(safe-area-inset-bottom))] pt-2">
        <p className="mx-auto max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground">
          Sign in with your FRAME email and password.
        </p>
      </footer>

      <style>{`
        @keyframes frame-auth-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .frame-auth-in {
          animation: frame-auth-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .frame-auth-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
