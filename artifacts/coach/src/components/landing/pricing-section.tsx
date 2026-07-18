import { Link } from "wouter";

export function PricingSection() {
  return (
    <section id="pricing" className="py-32 px-6 bg-background relative border-t border-white/[0.02]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-20 space-y-4">
          <h2 className="font-sans font-extralight text-3xl md:text-4xl uppercase tracking-[0.2em] text-foreground/90">
            Access Protocol
          </h2>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/50">
            Transparent scaling. No contracts.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Base Tier */}
          <div className="border border-white/[0.06] bg-black/40 p-10 flex flex-col">
            <h3 className="font-sans text-xl uppercase tracking-[0.2em] text-foreground/80 mb-2">Base System</h3>
            <div className="font-mono text-3xl text-foreground/90 mb-8">Free</div>
            
            <ul className="space-y-4 mb-12 flex-1 font-mono text-[11px] uppercase tracking-[0.1em] text-foreground/60">
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Core coaching conversations</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> One video analysis taster</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Daily readiness check-ins</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Guided breathing protocols</li>
            </ul>

            <Link href="/sign-up" className="block text-center border border-white/[0.1] py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/70 hover:bg-white/[0.02] hover:text-foreground/90 transition-all">
              Initialize Free
            </Link>
          </div>

          {/* FRAME+ */}
          <div className="border border-primary/20 bg-primary/[0.02] p-10 flex flex-col relative frame-plus-breath">
            <div className="absolute top-0 right-0 bg-primary text-black font-mono text-[9px] uppercase tracking-[0.3em] px-3 py-1 font-bold">
              Unrestricted
            </div>
            <h3 className="font-sans text-xl uppercase tracking-[0.2em] text-primary mb-2">FRAME+</h3>
            <div className="font-mono text-3xl text-foreground/90 mb-8 flex items-baseline gap-2">
              £6.99 <span className="text-xs text-foreground/40">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-12 flex-1 font-mono text-[11px] uppercase tracking-[0.1em] text-foreground/70">
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Full video analysis history</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Weekly mission</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Opponent scouting</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Complete athlete model</li>
              <li className="flex items-start gap-3"><span className="text-primary">■</span> Advanced readiness metrics</li>
            </ul>

            <Link href="/sign-up" className="block text-center bg-primary text-black py-4 font-mono text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-primary/90 transition-all">
              Upgrade to FRAME+
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
