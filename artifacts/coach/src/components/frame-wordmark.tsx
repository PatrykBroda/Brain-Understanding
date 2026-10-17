import { FrameOctagon } from "@/components/frame-octagon";

// The "FRAME AI" wordmark — layered octagon mark + wordmark, transparent
// background. Used in the Home and Chat headers (FINAL_UPDATE spec).
export function FrameWordmark({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <FrameOctagon size={size} glow={false} color="#B9A477" />
      <div className="flex items-center gap-2.5 leading-none">
        <span className="text-[15px] font-semibold tracking-[0.18em] text-[#F4F4F1]">FRAME</span>
        <span className="chip chip-gold !px-2 !py-[2px]">
          AI
        </span>
      </div>
    </div>
  );
}
