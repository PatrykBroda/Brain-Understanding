import { Brain, TrendingUp, Plus } from "lucide-react";
import { ontologyLabels } from "@workspace/ontology";
import type { AnalysisModelUpdate } from "@/lib/api";

// "Athlete Model Updated" — shown once, directly under a freshly created
// FRAME REPORT. Every number here is read back from the DB after real writes
// (evidence appended, confidence recomputed server-side). Nothing estimated.

const CATEGORY_LABELS: Record<string, string> = {
  strength: "Strength",
  weakness: "Weakness",
  technical_knowledge: "Technical",
  pattern: "Pattern",
  preference: "Preference",
  event: "Event",
  goal: "Goal",
  context: "Context",
};

function subLabel(subcategory: string | null): string | null {
  const labels = ontologyLabels(subcategory);
  if (!labels) return null;
  return `${labels.domainLabel} · ${labels.facetLabel}`;
}

export function ModelUpdateCard({ update }: { update: AnalysisModelUpdate }) {
  const { newObservations, confirmed, confidencePointsDelta } = update;
  if (newObservations.length === 0 && confirmed.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-primary/25 overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, hsla(35,55%,55%,0.07), hsla(0,0%,100%,0.015) 55%)",
      }}
      aria-label="Athlete model updated"
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <Brain className="w-3.5 h-3.5 text-primary/80" strokeWidth={1.5} />
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/90">
          Athlete model updated
        </div>
        {confidencePointsDelta > 0 && (
          <div
            className="ml-auto flex items-center gap-1 font-mono text-[10px] tabular-nums text-primary/80"
            title="Total confidence gained across confirmed observations — recomputed server-side from the evidence trail"
          >
            <TrendingUp className="w-3 h-3" strokeWidth={1.5} />
            +{confidencePointsDelta} conf
          </div>
        )}
      </div>

      <div className="px-5 pb-4 space-y-3">
        {confirmed.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/45">
              Confirmed by this footage
            </div>
            {confirmed.map((c) => (
              <div
                key={c.id}
                className="pl-3 py-1 flex items-baseline justify-between gap-3"
                style={{ borderLeft: "1px solid hsla(35,55%,55%,0.35)" }}
              >
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/80 truncate">
                    {c.topic || c.content}
                  </div>
                  <div
                    className="font-mono text-[9px] text-foreground/40 tabular-nums"
                    title="Independent sightings of this observation across chat, footage and calibration"
                  >
                    seen ×{c.evidenceCount}
                  </div>
                </div>
                <div className="flex-none font-mono text-[10px] tabular-nums">
                  {c.confidence > c.previousConfidence ? (
                    <span className="text-primary/90">
                      conf {c.previousConfidence}→{c.confidence}
                    </span>
                  ) : (
                    <span className="text-foreground/50">conf {c.confidence}/5</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {newObservations.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/45">
              New observations
            </div>
            {newObservations.map((o) => {
              const sub = subLabel(o.subcategory);
              return (
                <div
                  key={o.id}
                  className="pl-3 py-1 flex items-baseline justify-between gap-3"
                  style={{ borderLeft: "1px solid hsla(0,0%,100%,0.12)" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Plus className="w-2.5 h-2.5 flex-none text-foreground/40" strokeWidth={2} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/80 truncate">
                        {o.topic || o.content}
                      </span>
                    </div>
                    <div className="font-mono text-[9px] text-foreground/40 pl-4">
                      {CATEGORY_LABELS[o.category] ?? o.category}
                      {sub ? ` · ${sub}` : ""}
                    </div>
                  </div>
                  <div className="flex-none font-mono text-[10px] tabular-nums text-foreground/50">
                    conf {o.confidence}/5
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[0.7rem] leading-relaxed text-foreground/45 pt-1">
          Confidence only moves when the same thing shows up again — across chat,
          footage or calibration. Nothing here is estimated.
        </p>
      </div>
    </section>
  );
}
