import { FRAME_LOGO_BOX, FrameLogoGlyphs } from "@/components/frame-logo";

/**
 * "TRAIN WITH FRAME®" lock-up, rebuilt as live vector + text from the client's reference
 * (a WhatsApp screenshot, so it is a design reference, not a production asset). Sharp at every
 * size. The wordmark is the shared FrameLogo glyph set (open-chevron A, ® mark).
 * The client's original vector artwork should replace this when it arrives.
 */
export const TAGLINE_CAPS = "Your corner team between training sessions";

export function TrainWithFrame({ className = "", showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={className} role="img" aria-label={`Train with FRAME. ${TAGLINE_CAPS}.`}>
      <svg viewBox="0 0 600 102" className="block w-full" aria-hidden>
        <text x="300" y="21" fill="#F4F4F1" fontSize="22" textAnchor="middle" letterSpacing="11" style={{ fontFamily: "inherit", fontWeight: 500 }}>
          TRAIN WITH
        </text>
        <g transform={`translate(22 34) scale(0.36) translate(${-FRAME_LOGO_BOX.x} ${-FRAME_LOGO_BOX.y})`}>
          <FrameLogoGlyphs color="#F4F4F1" />
        </g>
      </svg>
      {showTagline && (
        <p className="mt-2.5 text-center text-[13px] font-medium tracking-[0.02em] text-[#B9A477]">
          {TAGLINE_CAPS}
        </p>
      )}
    </div>
  );
}
