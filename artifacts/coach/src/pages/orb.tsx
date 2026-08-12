import { useEffect, useState } from "react";
import { CosmicOrb, type OrbState } from "@/components/cosmic-orb";

const ORB_STATES: readonly OrbState[] = [
  "dormant",
  "stable",
  "loaded",
  "recovering",
  "tight",
  "volatile",
  "composed",
  "overextended",
  "streaming",
];

function isOrbState(value: string | null): value is OrbState {
  return value != null && (ORB_STATES as readonly string[]).includes(value);
}

/** Reads `?state=` from the current URL, validated against the OrbState union. */
function readStateFromUrl(): OrbState {
  if (typeof window === "undefined") return "stable";
  const raw = new URLSearchParams(window.location.search).get("state");
  const normalised = raw?.toLowerCase() ?? null;
  return isOrbState(normalised) ? normalised : "stable";
}

/**
 * Bare, chrome-less orb surface consumed by the mobile app via a WebView
 * (see frame-mobile/components/OrbWebView.tsx). Renders ONLY the CosmicOrb —
 * full-viewport, centered, on true black — so the native app can embed the
 * exact same WebGL orb the web hub uses. State is driven purely by the URL
 * query (`/orb?state=stable`); defaults to "stable" when missing/invalid.
 */
export default function OrbPage() {
  const [state, setState] = useState<OrbState>(() => readStateFromUrl());

  // Keep the orb in sync if the host swaps the query (e.g. WebView reloads the
  // same document with a new ?state without a full remount).
  useEffect(() => {
    const sync = () => setState(readStateFromUrl());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#000",
        overflow: "hidden",
      }}
    >
      <CosmicOrb
        state={state}
        className="h-[min(88vh,88vw)] w-[min(88vh,88vw)] max-h-[520px] max-w-[520px]"
      />
    </div>
  );
}
