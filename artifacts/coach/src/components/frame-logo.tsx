/**
 * FRAME® wordmark, rebuilt as vector from the client's reference (a WhatsApp screenshot, so a
 * design reference, not a production asset): wide-tracked thin geometric caps, the A an open
 * chevron with no crossbar, and a small ® mark. Replace with the client's original vector file
 * when it arrives; the shape data lives only in this file (plus the mobile twin FrameLogo.tsx).
 */
export const FRAME_LOGO_BOX = { x: 30, y: 20, w: 1545, h: 185 };

const STROKES = [
  "M47 195V59H210M47 111H170", // F
  "M347 195V59H470A38 38 0 0 1 470 135H347", // R
  "M1347 195V59H1510M1347 127H1470M1347 184H1510", // E
];
const FILLS = [
  "658,195 752,48 782,48 876,195 850,195 767,64 684,195", // A (open chevron), legs 22 thick like the strokes
  "435,130 465,130 527,195 497,195", // R leg, flat on the baseline
  "995,195 995,48 1024,48 1097.5,129 1171,48 1200,48 1200,195 1178,195 1178,68 1097.5,158 1017,68 1017,195", // M, stems and diagonals the same weight as F/R/E
];

/** Glyph paths only (drawn in FRAME_LOGO_BOX coordinates) for composing inside another <svg>. */
export function FrameLogoGlyphs({ color = "currentColor" }: { color?: string }) {
  return (
    <g>
      {STROKES.map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth="22" strokeLinejoin="miter" strokeLinecap="butt" fill="none" />
      ))}
      {FILLS.map((p, i) => (
        <polygon key={i} points={p} fill={color} />
      ))}
      <g transform="translate(1545 48)" stroke={color} fill="none">
        <circle r="21" strokeWidth="4" />
        <path d="M-6 10V-10H3Q9 -10 9 -4.5Q9 1 3 1H-6M3 1L9 10" strokeWidth="3.5" />
      </g>
    </g>
  );
}

/** The wordmark on its own. Height-driven: pass `height` (px); width follows the artwork ratio. */
export function FrameLogo({ height = 20, color = "#F4F4F1", className = "" }: { height?: number; color?: string; className?: string }) {
  const { x, y, w, h } = FRAME_LOGO_BOX;
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      height={height}
      width={(height * w) / h}
      className={`block ${className}`}
      role="img"
      aria-label="FRAME"
    >
      <FrameLogoGlyphs color={color} />
    </svg>
  );
}
