export function FooterSection() {
  return (
    <footer className="py-12 px-6 bg-black border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="font-sans font-extralight text-[15px] tracking-[0.55em] text-foreground/80 leading-none">
            FRAME
          </div>
          <div className="font-mono text-[9px] tracking-[0.3em] text-foreground/40 uppercase">
            Combat Performance Intelligence © {new Date().getFullYear()}
          </div>
        </div>
        <div className="flex items-center gap-6 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/40">
          <a href="#" className="hover:text-foreground/80 transition-colors">Privacy</a>
          <a href="#" className="hover:text-foreground/80 transition-colors">Terms</a>
        </div>
      </div>
    </footer>
  );
}
