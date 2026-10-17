import { useEffect, useId, useState } from "react";

/**
 * FRAME state visual (v3): a restrained sculptural black/silver sphere with a
 * champagne rim light. Pure SVG + CSS (no WebGL), so it is light enough for
 * every device and has an exact static twin.
 *
 * - Decorative only (aria-hidden). Wrap it in a <button> (see StatePage) to make
 *   it interactive and give it a text alternative.
 * - Motion is a slow ambient drift of the highlight (opacity/transform only,
 *   ~10-12s). It never pulses, beats or traces a waveform, so it cannot be read
 *   as live biometric measurement. The state only changes the highlight level.
 * - Static version: `static` prop, prefers-reduced-motion, Save-Data, or a
 *   low-memory device. The drift is also paused while the tab is hidden.
 */
export type OrbState =
  | "dormant"
  | "stable"
  | "loaded"
  | "recovering"
  | "tight"
  | "volatile"
  | "composed"
  | "overextended"
  | "streaming";

interface CosmicOrbProps {
  state?: OrbState;
  className?: string;
  /** Render the lightweight static version (no drift). */
  static?: boolean;
}

/** Highlight level per state (0-1). The only thing state changes. */
const LEVEL: Record<OrbState, number> = {
  dormant: 0.5,
  stable: 0.85,
  loaded: 1,
  recovering: 0.65,
  tight: 0.8,
  volatile: 1,
  composed: 0.95,
  overextended: 0.5,
  streaming: 1,
};

function useStaticPreferred(force?: boolean) {
  const [pref, setPref] = useState(() => {
    if (typeof window === "undefined") return true;
    const nav = navigator as unknown as { connection?: { saveData?: boolean }; deviceMemory?: number };
    return (
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !!nav.connection?.saveData ||
      (nav.deviceMemory != null && nav.deviceMemory <= 2)
    );
  });
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    const h = () => setPref(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return force || pref;
}

function useTabHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const h = () => setHidden(document.hidden);
    h();
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  return hidden;
}

export function CosmicOrb({ state = "dormant", className = "", static: forceStatic }: CosmicOrbProps) {
  const uid = useId().replace(/:/g, "");
  const still = useStaticPreferred(forceStatic);
  const hidden = useTabHidden();
  const k = LEVEL[state];
  const id = (n: string) => `${n}-${uid}`;
  const cls = still ? "" : "orb-anim";

  return (
    <div className={`relative aspect-square select-none pointer-events-none ${className}`} aria-hidden data-static={still ? "true" : "false"}>
      <svg viewBox="0 0 200 200" className={`block h-full w-full ${cls} ${hidden ? "orb-paused" : ""}`}>
        <defs>
          <radialGradient id={id("body")} cx="0.36" cy="0.28" r="0.85">
            <stop offset="0" stopColor="#3c3f44" />
            <stop offset="0.3" stopColor="#1c1e22" />
            <stop offset="0.62" stopColor="#0b0c0e" />
            <stop offset="1" stopColor="#040405" />
          </radialGradient>
          <radialGradient id={id("spec")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F4F4F1" stopOpacity={0.5 * k} />
            <stop offset="0.5" stopColor="#C9CDD2" stopOpacity={0.14 * k} />
            <stop offset="1" stopColor="#C9CDD2" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("champ")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#CDBB8E" stopOpacity={0.42 * k} />
            <stop offset="0.55" stopColor="#8A7A52" stopOpacity={0.12 * k} />
            <stop offset="1" stopColor="#8A7A52" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("edge")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.74" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id={id("shadow")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#000" stopOpacity="0.85" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("rim")} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
            <stop offset="0" stopColor="#F4F4F1" stopOpacity={0.3 * k} />
            <stop offset="0.45" stopColor="#F4F4F1" stopOpacity="0.03" />
            <stop offset="1" stopColor="#CDBB8E" stopOpacity={0.4 * k} />
          </linearGradient>
          <clipPath id={id("clip")}>
            <circle cx="100" cy="98" r="84" />
          </clipPath>
        </defs>

        {/* contact shadow: a shadow, not a glow */}
        <ellipse cx="100" cy="188" rx="58" ry="7" fill={`url(#${id("shadow")})`} />

        <g clipPath={`url(#${id("clip")})`}>
          <circle cx="100" cy="98" r="84" fill={`url(#${id("body")})`} />

          {/* fine lattice: reads as sculpted form, drifts a few px */}
          <g className="orb-lattice" fill="none" stroke="#F4F4F1" strokeOpacity={0.05 + 0.03 * k} strokeWidth="0.6">
            <ellipse cx="100" cy="98" rx="84" ry="26" />
            <ellipse cx="100" cy="98" rx="84" ry="52" />
            <ellipse cx="100" cy="98" rx="30" ry="84" />
            <ellipse cx="100" cy="98" rx="58" ry="84" />
            <line x1="16" y1="98" x2="184" y2="98" />
          </g>

          {/* champagne rim light, lower right */}
          <ellipse cx="150" cy="150" rx="70" ry="60" fill={`url(#${id("champ")})`} />

          {/* silver specular, upper left */}
          <g className="orb-spec">
            <ellipse cx="72" cy="56" rx="38" ry="22" transform="rotate(-32 72 56)" fill={`url(#${id("spec")})`} />
          </g>

          <circle cx="100" cy="98" r="84" fill={`url(#${id("edge")})`} />
        </g>

        <circle cx="100" cy="98" r="83.5" fill="none" stroke={`url(#${id("rim")})`} strokeWidth="1" />
      </svg>

      <style>{`
        .orb-anim .orb-spec { animation: orb-drift-a 10s ease-in-out infinite alternate; }
        .orb-anim .orb-lattice { animation: orb-drift-b 12s ease-in-out infinite alternate; }
        .orb-paused .orb-spec, .orb-paused .orb-lattice { animation-play-state: paused !important; }
        @keyframes orb-drift-a { from { transform: translate(-5px, 3px); opacity: .85; } to { transform: translate(7px, -2px); opacity: 1; } }
        @keyframes orb-drift-b { from { transform: translate(-2px, 0); } to { transform: translate(2px, 1px); } }
        @media (prefers-reduced-motion: reduce) {
          .orb-anim .orb-spec, .orb-anim .orb-lattice { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
