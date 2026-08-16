import { FrameOctagon } from "@/components/frame-octagon";

// The "FRAME AI" wordmark — layered octagon mark + wordmark, transparent
// background. Used in the Home and Chat headers (FINAL_UPDATE spec).
export function FrameWordmark({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <FrameOctagon size={size} glow={false} color="hsl(39,49%,36%)" />
      <div className="font-sans font-extralight text-[14px] tracking-[0.5em] text-foreground/95 leading-none">
        FRAME
        <span className="font-mono text-[9px] tracking-[0.4em] text-primary/80 ml-3">
          AI
        </span>
      </div>
    </div>
  );
}
