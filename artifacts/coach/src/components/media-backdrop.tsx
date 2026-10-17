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
 * Placeholder footage until the client supplies their edit (see RESULT.md).
 */
export function VideoBackdrop({ blur = 3, dim = 0.55 }: { blur?: number; dim?: number }) {
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
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ filter: "saturate(0.8)" }} />
      {!still && !failed && (
        <video
          ref={ref}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: ready ? 1 : 0, filter: "saturate(0.85)" }}
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
      {/* blur + darken + warm bleed so the form stays legible over fast cuts */}
      <div
        className="absolute inset-0"
        style={{ WebkitBackdropFilter: `blur(${blur}px)`, backdropFilter: `blur(${blur}px)`, background: `rgba(8,9,11,${dim})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,9,11,0.7) 0%, rgba(8,9,11,0.0) 28%, rgba(8,9,11,0.2) 52%, rgba(8,9,11,0.92) 100%), radial-gradient(70% 45% at 85% 0%, rgba(214,120,40,0.26), transparent 70%), radial-gradient(60% 40% at 0% 100%, rgba(229,100,90,0.22), transparent 70%)",
        }}
      />
    </div>
  );
}

/**
 * Photo behind a header or card: full-bleed, blurred, darkened, with a warm
 * glow bleeding off one corner and a fade into the page. Absolute-positioned;
 * the parent must be `relative` (and usually `overflow-hidden`).
 */
export function PhotoBackdrop({
  src = MEDIA.stillA,
  blur = 10,
  opacity = 0.55,
  position = "center",
  fade = true,
  glow = "right",
  className = "",
}: {
  src?: string;
  blur?: number;
  opacity?: number;
  position?: string;
  fade?: boolean;
  glow?: "right" | "left" | "none";
  className?: string;
}) {
  return (
    <div aria-hidden className={`absolute inset-0 z-0 overflow-hidden pointer-events-none select-none ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-[-8%] h-[116%] w-[116%] max-w-none object-cover"
        style={{ objectPosition: position, filter: `blur(${blur}px) saturate(0.9) contrast(1.05)`, opacity }}
      />
      {glow !== "none" && (
        <div
          className="absolute inset-0"
          style={{
            background:
              glow === "right"
                ? "radial-gradient(70% 70% at 100% 0%, rgba(214,120,40,0.34), transparent 70%)"
                : "radial-gradient(70% 70% at 0% 0%, rgba(214,120,40,0.30), transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: fade
            ? "linear-gradient(180deg, rgba(8,9,11,0.35) 0%, rgba(8,9,11,0.2) 40%, #08090B 100%)"
            : "rgba(8,9,11,0.35)",
        }}
      />
    </div>
  );
}

/**
 * Page-level backdrop for the signed-in app: a fixed, heavily blurred FRAME
 * photo behind everything (z -1, so transparent page roots show it through).
 */
export function AppBackdrop({ src, position = "center" }: { src: string; position?: string }) {
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none select-none" style={{ zIndex: -1 }}>
      <img
        src={src}
        alt=""
        decoding="async"
        className="absolute inset-[-10%] h-[120%] w-[120%] max-w-none object-cover"
        style={{ objectPosition: position, filter: "blur(26px) saturate(0.85) contrast(1.1)", opacity: 0.5 }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 50% at 100% 0%, rgba(214,120,40,0.30), transparent 70%), radial-gradient(70% 45% at 0% 100%, rgba(229,100,90,0.18), transparent 70%), linear-gradient(180deg, rgba(8,9,11,0.35) 0%, rgba(8,9,11,0.55) 55%, rgba(8,9,11,0.92) 100%)",
        }}
      />
    </div>
  );
}
