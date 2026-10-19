import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useFighter } from "@/hooks/use-fighter";
import { OpeningScene } from "@/components/entry-sequence";

/**
 * First-launch intro. Shows the brand lines over the monochrome imagery, then
 * auto-advances to home after 3s; "Continue" goes immediately.
 */
export default function SplashPage() {
  const [, setLocation] = useLocation();
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const [leaving, setLeaving] = useState(false);

  const exit = () => {
    if (leaving) return;
    setLeaving(true);
    try {
      localStorage.setItem("frame:intro-seen", "1");
    } catch {
      // storage blocked - ignore
    }
    window.setTimeout(() => setLocation("/home"), 320);
  };

  useEffect(() => {
    const t = window.setTimeout(exit, 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <OpeningScene name={fighter?.name ?? null} closing={leaving} onContinue={exit} />;
}
