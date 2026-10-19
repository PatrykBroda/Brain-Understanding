import { useEffect, useRef, useState } from "react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const MEDIA = {
  poster: `${base}/media/frame-auth-poster.jpg`,
  video: `${base}/media/frame-auth.mp4`,
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
 * - one portrait cut (576x1024) everywhere; object-fit cover + scrim on landscape
 * - MONOCHROME: grayscale + dark gradient scrim, no warm grade, no blur.
 *   Top and bottom bands stay dark so headline/controls keep contrast.
 *
 * Footage is FRAME's own edit (client-supplied). A 1080x1920 master and a 16:9
 * cut would look sharper on large/landscape screens.
 */
export function VideoBackdrop({ dim = 0.5 }: { dim?: number; /** @deprecated ignored (no blur in v3) */ blur?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const still = prefersReducedMotion() || saveData();
  const poster = MEDIA.poster;

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
          <source src={MEDIA.video} type="video/mp4" />
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
