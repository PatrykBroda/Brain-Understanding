import { useEffect, useState } from "react";
import { Calendar, Check, RefreshCw, Unlink, X } from "lucide-react";
import {
  useDisconnectGoogle,
  useGoogleApply,
  useGooglePreview,
  useGoogleStatus,
  useStartGoogleLink,
  localTimeZone,
} from "@/hooks/use-google";
import {
  SESSION_TYPES,
  SESSION_TYPE_LABEL,
  type GoogleApplyResult,
  type GoogleImportItem,
  type SessionType,
} from "@/lib/api";

type PreviewRow = GoogleImportItem & { selected: boolean; sessionType: SessionType };

export function GoogleCalendarSync({ campId }: { campId: number }) {
  const statusQ = useGoogleStatus();
  const start = useStartGoogleLink();
  const disconnect = useDisconnectGoogle();
  const preview = useGooglePreview();
  const apply = useGoogleApply();

  const [linking, setLinking] = useState(false);
  const [mode, setMode] = useState<"idle" | "preview">("idle");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [exportSessions, setExportSessions] = useState(true);
  const [result, setResult] = useState<GoogleApplyResult | null>(null);

  const connected = statusQ.data?.connected ?? false;
  const configured = statusQ.data?.configured ?? false;
  const { refetch } = statusQ;

  // While a consent popup is open, poll status until the link lands (the callback
  // page auto-closes, so we can't rely on a window handle). Depend on the STABLE
  // refetch fn (not the whole query object) so a poll tick doesn't reset the
  // 120s abandon timeout.
  useEffect(() => {
    if (!linking) return;
    if (connected) {
      setLinking(false);
      return;
    }
    const iv = window.setInterval(() => void refetch(), 2500);
    const to = window.setTimeout(() => setLinking(false), 120_000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
  }, [linking, connected, refetch]);

  const connect = () => {
    start.mutate(undefined, {
      onSuccess: ({ url }) => {
        window.open(url, "google-link", "noopener,noreferrer,width=520,height=680");
        setLinking(true);
      },
    });
  };

  const runPreview = () => {
    setResult(null);
    preview.mutate(
      { campId, timeZone: localTimeZone() },
      {
        onSuccess: ({ items }) => {
          setRows(
            items.map((i) => ({ ...i, selected: true, sessionType: i.suggestedType })),
          );
          setMode("preview");
        },
      },
    );
  };

  const runApply = () => {
    const chosen = rows.filter((r) => r.selected);
    apply.mutate(
      {
        campId,
        timeZone: localTimeZone(),
        importItems: chosen.map((r) => ({
          externalEventId: r.externalEventId,
          sessionType: r.sessionType,
          sessionDate: r.sessionDate,
          startTime: r.startTime,
          durationMin: r.durationMin,
          objective: r.title,
        })),
        exportSessions,
      },
      {
        onSuccess: (r) => {
          setResult(r);
          setMode("idle");
        },
      },
    );
  };

  const setRow = (id: string, patch: Partial<PreviewRow>) =>
    setRows((rs) => rs.map((r) => (r.externalEventId === id ? { ...r, ...patch } : r)));

  // Server not set up — say so quietly, no dead buttons.
  if (statusQ.isSuccess && !configured) {
    return (
      <section className="glass px-4 py-3.5">
        <div className="flex items-center gap-2 text-[1rem] font-medium text-foreground">
          <Calendar className="w-4 h-4" strokeWidth={1.5} />
          Google Calendar
        </div>
        <p className="mt-2 text-[0.9375rem] leading-[1.55] text-muted-foreground">
          Calendar sync isn't enabled on this server yet.
        </p>
      </section>
    );
  }

  return (
    <section className="glass">
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[1rem] font-medium text-foreground">
            <Calendar className="w-4 h-4" strokeWidth={1.5} />
            Google Calendar
          </div>
          {connected && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Unlink Google Calendar? Synced sessions stay; syncing stops.")) {
                  disconnect.mutate();
                }
              }}
              disabled={disconnect.isPending}
              className="btn-quiet !border-transparent !px-2 text-muted-foreground hover:!text-[#E5645A] disabled:opacity-50"
            >
              <Unlink className="w-4 h-4" strokeWidth={1.5} />
              {disconnect.isPending ? "Unlinking" : "Unlink"}
            </button>
          )}
        </div>

        {!connected ? (
          <>
            <p className="mt-2 text-[0.9375rem] leading-[1.55] text-muted-foreground">
              Link your Google Calendar to pull training into your camp schedule and push
              manual sessions back. You confirm every change before it happens.
            </p>
            <button
              type="button"
              onClick={connect}
              disabled={start.isPending || linking}
              className="mt-4 w-full btn-quiet disabled:opacity-50"
            >
              {linking ? "Waiting for Google" : start.isPending ? "Opening" : "Connect Google Calendar"}
            </button>
            {start.isError && (
              <p className="mt-2 text-[0.875rem] text-[#E5645A]">
                Could not start linking — try again
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2 text-[0.875rem] text-muted-foreground">
              <Check className="w-4 h-4 text-[#B9A477]" strokeWidth={2} />
              <span className="truncate">
                Linked{statusQ.data?.googleEmail ? ` · ${statusQ.data.googleEmail}` : ""}
              </span>
            </div>
            {mode === "idle" && (
              <button
                type="button"
                onClick={runPreview}
                disabled={preview.isPending}
                className="mt-4 w-full btn-quiet disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${preview.isPending ? "animate-spin motion-reduce:animate-none" : ""}`}
                  strokeWidth={1.5}
                />
                {preview.isPending ? "Reading calendar" : "Sync with calendar"}
              </button>
            )}
            {(preview.isError || apply.isError) && (
              <p className="mt-2 text-[0.875rem] text-[#E5645A]">
                {syncErrorLabel(preview.error ?? apply.error)}
              </p>
            )}
            {result && mode === "idle" && (
              <p className="mt-2 text-[0.875rem] tnum text-muted-foreground">
                Imported {result.imported} · Exported {result.exported}
              </p>
            )}
          </>
        )}
      </div>

      {mode === "preview" && (
        <div className="border-t border-white/[0.06] px-4 py-3.5 space-y-3">
          <div className="label tnum">
            Review import · {rows.filter((r) => r.selected).length}/{rows.length} selected
          </div>

          {rows.length === 0 ? (
            <p className="text-[0.9375rem] text-muted-foreground">
              No calendar events found in your camp window.
            </p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {rows.map((r) => (
                <li
                  key={r.externalEventId}
                  className="border border-white/[0.08] bg-[#191C20] px-3 py-3 rounded-[14px]"
                  style={{ opacity: r.selected ? 1 : 0.45 }}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      aria-pressed={r.selected}
                      aria-label={r.selected ? "Deselect" : "Select"}
                      onClick={() => setRow(r.externalEventId, { selected: !r.selected })}
                      className="mt-0.5 w-[22px] h-[22px] rounded-[7px] flex-none border flex items-center justify-center"
                      style={{
                        borderColor: r.selected ? "#B9A477" : "hsla(0,0%,100%,0.2)",
                        background: r.selected ? "#B9A477" : "transparent",
                      }}
                    >
                      {r.selected && <Check className="w-3.5 h-3.5 text-[#0B0C0E]" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[1rem] font-medium text-foreground truncate">{r.title}</div>
                      <div className="label tnum mt-0.5 mb-2">
                        {r.sessionDate}
                        {r.startTime ? ` · ${r.startTime}` : " · all day"}
                        {r.durationMin ? ` · ${r.durationMin}m` : ""}
                      </div>
                      <select
                        value={r.sessionType}
                        onChange={(e) =>
                          setRow(r.externalEventId, {
                            sessionType: e.target.value as SessionType,
                          })
                        }
                        disabled={!r.selected}
                        className="field-glass !py-0 !text-[0.9375rem] !min-h-[44px]"
                      >
                        {SESSION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {SESSION_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <button
              type="button"
              aria-pressed={exportSessions}
              onClick={() => setExportSessions((v) => !v)}
              className="w-[22px] h-[22px] rounded-[7px] flex-none border flex items-center justify-center"
              style={{
                borderColor: exportSessions ? "#B9A477" : "hsla(0,0%,100%,0.2)",
                background: exportSessions ? "#B9A477" : "transparent",
              }}
            >
              {exportSessions && <Check className="w-3.5 h-3.5 text-[#0B0C0E]" strokeWidth={3} />}
            </button>
            <span className="text-[0.9375rem] text-muted-foreground">
              Also push my manual sessions to Google Calendar
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="btn-glass flex-1 !min-h-[48px]"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
              Cancel
            </button>
            <button
              type="button"
              onClick={runApply}
              disabled={apply.isPending}
              className="btn-bronze flex-1 !min-h-[48px]"
            >
              {apply.isPending ? "Syncing" : "Apply sync"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function syncErrorLabel(err: unknown): string {
  const status = (err as { status?: number | null })?.status ?? null;
  if (status === 409) return "Google access expired — reconnect your calendar";
  return "Sync failed — try again";
}
