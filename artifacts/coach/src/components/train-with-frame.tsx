/**
 * "TRAIN WITH FRAME®" lock-up, rebuilt as live vector + text from the client's reference
 * (a WhatsApp screenshot, so it is a design reference, not a production asset). Sharp at every
 * size. The five letters are drawn as strokes (the A is an open chevron, as in the artwork).
 * The client's original vector artwork should replace this when it arrives.
 */
const LETTERS = [
  "M12 94V6H78M12 48H66", // F
  "M132 94V6H182Q212 6 212 32Q212 58 182 58H132M178 58L214 94", // R
  "M242 94L282 6L322 94", // A (open chevron)
  "M372 94V6L412 60L452 6V94", // M
  "M552 6H502V94H552M502 50H544", // E
];

export const TAGLINE_CAPS = "Your corner team between training sessions";

export function TrainWithFrame({ className = "", showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={className} role="img" aria-label={`Train with FRAME. ${TAGLINE_CAPS}.`}>
      <svg viewBox="0 0 600 118" className="block w-full" aria-hidden>
        <text x="300" y="21" fill="#F4F4F1" fontSize="22" textAnchor="middle" letterSpacing="11" style={{ fontFamily: "inherit", fontWeight: 500 }}>
          TRAIN WITH
        </text>
        {LETTERS.map((d, i) => (
          <path key={i} d={d} transform="translate(0 20)" stroke="#F4F4F1" strokeWidth="11" strokeLinejoin="miter" strokeLinecap="butt" fill="none" />
        ))}
        <text x="578" y="52" fill="#F4F4F1" fontSize="18" textAnchor="middle" style={{ fontFamily: "inherit", fontWeight: 500 }}>
          ®
        </text>
      </svg>
      {showTagline && (
        <p className="mt-2.5 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-[#B9A477] sm:text-xs">
          {TAGLINE_CAPS}
        </p>
      )}
    </div>
  );
}
