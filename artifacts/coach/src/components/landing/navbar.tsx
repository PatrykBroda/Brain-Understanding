import { Link } from "wouter";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-white/[0.04]">
      <Link href="/" className="group flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <div className="font-sans font-extralight text-[15px] tracking-[0.55em] text-foreground/95 leading-none group-hover:text-primary transition-colors">
          FRAME
        </div>
      </Link>
      <div className="hidden md:flex items-center gap-8">
        <a href="#philosophy" className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/55 hover:text-foreground/90 transition-colors">Philosophy</a>
        <a href="#capabilities" className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/55 hover:text-foreground/90 transition-colors">Capabilities</a>
        <a href="#pricing" className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/55 hover:text-foreground/90 transition-colors">Pricing</a>
        <a href="#faq" className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/55 hover:text-foreground/90 transition-colors">FAQ</a>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/sign-in" className="hidden md:block font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/55 hover:text-foreground/90 transition-colors">
          Sign In
        </Link>
        <Link href="/sign-up" className="px-4 py-2 bg-primary text-black font-mono text-[10px] tracking-[0.2em] uppercase hover:bg-primary/90 transition-colors shadow-[0_0_15px_-3px_hsla(32,54%,46%,0.4)]">
          Access
        </Link>
      </div>
    </nav>
  );
}
