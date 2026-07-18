export function AthleteModelSection() {
  const stages = [
    "Observer",
    "Pattern recognition",
    "Personal coach",
    "Performance partner"
  ];

  return (
    <section className="py-32 px-6 bg-background relative border-t border-white/[0.02]">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-16">
        <div className="md:w-1/2 space-y-8">
          <div className="inline-block px-3 py-1 border border-primary/30 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            Evolving Architecture
          </div>
          <h2 className="font-sans font-extralight text-3xl md:text-4xl uppercase tracking-[0.15em] text-foreground/90 leading-tight">
            The Athlete <br/> Model
          </h2>
          <p className="font-sans font-light text-lg text-foreground/60 leading-relaxed">
            FRAME builds an evidence-based model of your performance. It relies on facts with provenance and confidence earned over time, adapting to your specific needs.
          </p>
        </div>
        
        <div className="md:w-1/2 w-full">
          <div className="border-l border-white/[0.08] pl-8 py-4 space-y-12">
            {stages.map((stage, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[37px] top-1.5 w-2 h-2 rounded-none bg-primary shadow-[0_0_10px_hsla(32,54%,46%,0.8)]" />
                <div className="font-mono text-[10px] text-foreground/40 mb-1 tracking-[0.3em] uppercase">Phase 0{i + 1}</div>
                <div className="font-sans text-xl tracking-wide text-foreground/80 uppercase">{stage}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
