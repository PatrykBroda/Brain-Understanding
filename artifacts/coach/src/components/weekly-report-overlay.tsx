import { useRef, useState } from "react";
import { X, Download, Share2, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { useWeeklyReport } from "@/hooks/use-report";
import { useFighter } from "@/hooks/use-fighter";
import { FrameIntelligenceReport } from "@/components/frame-intelligence-report";

// Self-contained overlay: fetches the weekly report (which idempotently writes
// this week's snapshot on the server), renders the shareable card, and wires
// Download + Share through the same html-to-image pipeline as the FRAME REPORT.
export function WeeklyReportOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const { data, isLoading, isError, refetch } = useWeeklyReport(open);
  const report = data?.report ?? null;
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function renderPng(): Promise<string | null> {
    if (!cardRef.current) return null;
    return toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#060504", cacheBust: true });
  }

  async function download() {
    setBusy(true);
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.download = `frame-intelligence-${report?.weekStart ?? "week"}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // best-effort export
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `frame-intelligence-${report?.weekStart ?? "week"}.png`, {
        type: "image/png",
      });
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: "FRAME Intelligence Report" });
      } else {
        // no native share (desktop) — fall back to a download
        const link = document.createElement("a");
        link.download = file.name;
        link.href = dataUrl;
        link.click();
      }
    } catch {
      // user cancelled or share unsupported — silent
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="FRAME Intelligence Report"
    >
      <div className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/30">
        <div className="font-mono text-[11px] uppercase tracking-[0.4em] text-foreground/90">
          Intelligence Report
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-8 flex flex-col items-center gap-5">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em]">Reading the week</span>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-4 py-16">
              <p className="text-sm text-foreground/70">Couldn't build this week's report.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 hover:border-primary/50 px-4 py-2.5 text-foreground/80 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {!isLoading && !isError && report && (
            <>
              <FrameIntelligenceReport ref={cardRef} report={report} fighter={fighter} />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={download}
                  disabled={busy}
                  className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 hover:border-primary/50 px-4 py-2.5 text-foreground/80 transition-colors disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {busy ? "Rendering…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  disabled={busy}
                  className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] border border-primary/40 hover:border-primary/70 px-4 py-2.5 text-foreground/90 transition-colors disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Share
                </button>
              </div>
            </>
          )}

          {!isLoading && !isError && !report && (
            <div className="py-16 text-center">
              <p className="text-sm text-foreground/70">
                Set up your fighter profile to start building your intelligence report.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
