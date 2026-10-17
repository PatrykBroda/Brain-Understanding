import { FrameOctagon } from "@/components/frame-octagon";

// The "FRAME AI" wordmark — layered octagon mark + wordmark, transparent
// background. Used in the Home and Chat headers (FINAL_UPDATE spec).
export function FrameWordmark({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <FrameOctagon size={size} glow={false} color="hsl(39,50%,56%)" />
      <div className="flex items-center gap-2.5 leading-none">
        <span className="font-sans font-normal text-[15px] text-[#F4F4F1]">FRAME</span>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-[3px] text-xs font-medium text-[hsl(var(--primary-light))]">
          AI
        </span>
      </div>
    </div>
  );
}
