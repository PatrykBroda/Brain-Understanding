export function CapabilitiesSection() {
  const capabilities = [
    {
      title: "Conversational Coaching",
      desc: "Grounded in a structured knowledge framework, delivering nuanced tactical and psychological advice, not general platitudes."
    },
    {
      title: "Video Analysis",
      desc: "Pose tracking runs entirely on your device. Deterministic measured scores. AI writes only the narrative around the raw numbers."
    },
    {
      title: "Camp Mode",
      desc: "Fight-camp countdown, structured phases, and automated training schedule integration to peak at the right moment."
    },
    {
      title: "Daily Readiness",
      desc: "Self-reported, honest check-ins. Guided breathing protocols and drill prescriptions to calibrate your nervous system."
    },
    {
      title: "Combat Archetypes",
      desc: "An identity system that categorizes your default response to pressure and builds technical pathways to transcend it."
    },
    {
      title: "Installable PWA",
      desc: "Built mobile-first. Install it directly on your phone like a native app. Access the terminal anywhere."
    }
  ];

  return (
    <section id="capabilities" className="py-32 px-6 bg-black relative border-t border-white/[0.02]">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-sans font-extralight text-3xl uppercase tracking-[0.2em] text-foreground/90 mb-16">
          System Capabilities
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {capabilities.map((cap, i) => (
            <div key={i} className="p-8 border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors group">
              <div className="font-mono text-[10px] text-primary mb-4 tracking-[0.3em] uppercase">0{i + 1}</div>
              <h3 className="font-sans text-xl uppercase tracking-[0.1em] text-foreground/90 mb-3">{cap.title}</h3>
              <p className="font-sans font-light text-sm text-foreground/60 leading-relaxed group-hover:text-foreground/80 transition-colors">
                {cap.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
