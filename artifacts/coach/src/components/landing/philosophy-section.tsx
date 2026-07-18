export function PhilosophySection() {
  return (
    <section id="philosophy" className="py-32 px-6 bg-background relative border-t border-white/[0.02]">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-16 md:gap-24">
        <div className="md:w-1/3 flex flex-col gap-4">
          <h2 className="font-sans font-extralight text-2xl md:text-3xl uppercase tracking-[0.2em] text-foreground/90">
            A Quiet <br/>Operating System
          </h2>
          <div className="w-12 h-[1px] bg-primary/50" />
        </div>
        <div className="md:w-2/3 space-y-8 text-foreground/60 font-sans font-light text-lg md:text-xl leading-relaxed tracking-wide">
          <p>
            FRAME is not a fitness app. It does not hype you up, blast notifications, or give generic advice. It is a dim, serious space for serious practitioners.
          </p>
          <p>
            It observes how you move and think under pressure, building a structured evolving model of you from every conversation, video analysis and check-in. It coaches with earned precision.
          </p>
          <p className="text-foreground/80 pl-4 border-l-2 border-primary/40 font-mono text-sm uppercase tracking-widest mt-8">
            Restrained. Honest. Premium.
          </p>
        </div>
      </div>
    </section>
  );
}
