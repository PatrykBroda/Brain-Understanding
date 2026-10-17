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
    return toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#08090B", cacheBust: true });
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
      className="fixed inset-0 z-50 flex flex-col overlay-surface !rounded-none !border-0 !bg-[#08090B]/90"
      role="dialog"
      aria-modal="true"
      aria-label="FRAME Intelligence Report"
    >
      <div className="flex-none flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 border-b border-white/[0.08]">
        <h2 className="section-title">Intelligence report</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-8 flex flex-col items-center gap-5">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground" role="status">
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
              <span className="text-[0.9375rem]">Reading the week</span>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-4 py-16">
              <p className="text-[1rem] text-foreground/80">Could not build this week's report.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="btn-quiet"
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
                  className="btn-glass disabled:opacity-50"
                >
                  <Download className="w-4 h-4" strokeWidth={1.5} />
                  {busy ? "Rendering…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  disabled={busy}
                  className="btn-bronze disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" strokeWidth={1.5} />
                  Share
                </button>
              </div>
            </>
          )}

          {!isLoading && !isError && !report && (
            <div className="py-16 text-center">
              <p className="text-[1rem] text-foreground/80">
                Set up your fighter profile to start building your intelligence report.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
