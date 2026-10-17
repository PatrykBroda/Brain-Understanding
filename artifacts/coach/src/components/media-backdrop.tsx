import { useEffect, useRef, useState } from "react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const MEDIA = {
  gym: `${base}/media/gym-hero.jpg`,
  stillA: `${base}/media/fight-still-a.jpg`,
  stillB: `${base}/media/fight-still-b.jpg`,
  posterPortrait: `${base}/media/frame-auth-portrait-poster.jpg`,
  posterWide: `${base}/media/frame-auth-wide-poster.jpg`,
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
function saveData() {
  const c = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

/**
 * Full-bleed, looping, muted background video with a poster fallback.
 * - reduced motion / data saver: poster only, no video is loaded
 * - video error / autoplay blocked: poster stays, UI is never blocked (pointer-events none)
 * - portrait cut on tall screens, wide cut on landscape
 * - MONOCHROME: grayscale + dark gradient scrim, no warm grade, no blur.
 *   Top and bottom bands stay dark so headline/controls keep contrast.
 *
 * PLACEHOLDER: the footage and posters (frame-auth-*) are third-party stock
 * cut for layout only. Swap those files for the client's edit; do not ship.
 */
export function VideoBackdrop({ dim = 0.5 }: { dim?: number; /** @deprecated ignored (no blur in v3) */ blur?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const still = prefersReducedMotion() || saveData();
  const wide = typeof window !== "undefined" && window.matchMedia?.("(min-aspect-ratio: 11/10)").matches;
  const name = wide ? "wide" : "portrait";
  const poster = wide ? MEDIA.posterWide : MEDIA.posterPortrait;

  useEffect(() => {
    const v = ref.current;
    if (!v || still) return;
    const onVis = () => (document.hidden ? v.pause() : void v.play().catch(() => setFailed(true)));
    document.addEventListener("visibilitychange", onVis);
    v.play().catch(() => setFailed(true));
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [still]);

  return (
    <div aria-hidden className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#08090B]">
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ filter: "grayscale(1)" }} />
      {!still && !failed && (
        <video
          ref={ref}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: ready ? 1 : 0, filter: "grayscale(1)" }}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          poster={poster}
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
        >
          <source src={`${base}/media/frame-auth-${name}.webm`} type="video/webm" />
          <source src={`${base}/media/frame-auth-${name}.mp4`} type="video/mp4" />
        </video>
      )}
      <div className="absolute inset-0" style={{ background: `rgba(8,9,11,${dim})` }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,9,11,0.72) 0%, rgba(8,9,11,0.08) 30%, rgba(8,9,11,0.35) 52%, rgba(8,9,11,0.95) 100%)",
        }}
      />
    </div>
  );
}

/**
 * Photo behind ONE hero block or card: full-bleed, monochrome, with a dark
 * gradient scrim fading into the page (reserved text band at the bottom).
 * Absolute-positioned; the parent must be `relative`. Never behind a whole
 * app screen (v3 removed per-route photo backdrops).
 */
export function PhotoBackdrop({
  src = MEDIA.stillA,
  opacity = 0.7,
  position = "center",
  className = "",
}: {
  src?: string;
  opacity?: number;
  position?: string;
  className?: string;
}) {
  return (
    <div aria-hidden className={`absolute inset-0 z-0 overflow-hidden pointer-events-none select-none ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: position, filter: "grayscale(1) contrast(1.05)", opacity }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(8,9,11,0.35) 0%, rgba(8,9,11,0.25) 35%, #08090B 100%)" }}
      />
    </div>
  );
}
