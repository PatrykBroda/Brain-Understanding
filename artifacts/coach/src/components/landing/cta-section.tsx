import { Link } from "wouter";

export function CtaSection() {
  return (
    <section className="py-40 px-6 bg-black relative border-t border-white/[0.02] flex flex-col items-center justify-center text-center">
      <div className="absolute inset-0 pointer-events-none opacity-30" 
           style={{
             background: "radial-gradient(circle at 50% 50%, hsl(var(--primary)/0.1) 0%, transparent 60%)"
           }} 
      />
      <div className="relative z-10 space-y-8 max-w-2xl">
        <h2 className="font-sans font-extralight text-[clamp(2rem,5vw,4rem)] uppercase tracking-[0.2em] text-foreground/95 leading-tight">
          Enter The <br />
          <span className="text-primary italic">Frame</span>
        </h2>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-foreground/50 max-w-md mx-auto">
          The model begins building from your first session.
        </p>
        <div className="pt-8">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center px-12 py-5 bg-primary text-black font-mono text-[11px] uppercase tracking-[0.4em] font-bold hover:bg-primary/90 transition-all focus-visible:ring-2 focus-visible:ring-primary/60 outline-none"
          >
            Initiate Calibration
          </Link>
        </div>
      </div>
    </section>
  );
}
