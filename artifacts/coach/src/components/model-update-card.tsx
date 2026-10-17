import { Brain, TrendingUp } from "lucide-react";
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
    <section className="glass overflow-hidden" aria-label="Athlete model updated">
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <Brain className="w-4 h-4 text-[#B9A477]" strokeWidth={1.5} />
        <h2 className="section-title !text-[1.0625rem]">Athlete model updated</h2>
        {confidencePointsDelta > 0 && (
          <span
            className="chip chip-gold ml-auto tnum"
            title="Total confidence gained across confirmed observations, recomputed server-side from the evidence trail"
          >
            <TrendingUp className="w-3 h-3" strokeWidth={1.5} />
            +{confidencePointsDelta} confidence
          </span>
        )}
      </div>

      <div className="px-5 pb-4">
        {confirmed.length > 0 && (
          <div>
            <div className="label pb-1">Confirmed by this footage</div>
            <ul>
              {confirmed.map((c) => (
                <li
                  key={c.id}
                  className="py-3 flex items-baseline justify-between gap-3 border-t border-white/[0.06]"
                >
                  <div className="min-w-0">
                    <div className="text-[1rem] text-foreground leading-snug">{c.topic || c.content}</div>
                    <div
                      className="label tnum mt-0.5"
                      title="Independent sightings of this observation across chat, footage and calibration"
                    >
                      Seen {c.evidenceCount} {c.evidenceCount === 1 ? "time" : "times"}
                    </div>
                  </div>
                  <div className="flex-none text-[0.875rem] tnum">
                    {c.confidence > c.previousConfidence ? (
                      <span className="text-[#D4C7A3]">
                        Confidence {c.previousConfidence} to {c.confidence}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Confidence {c.confidence} of 5</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {newObservations.length > 0 && (
          <div className={confirmed.length > 0 ? "mt-3" : ""}>
            <div className="label pb-1">New observations</div>
            <ul>
              {newObservations.map((o) => {
                const sub = subLabel(o.subcategory);
                return (
                  <li
                    key={o.id}
                    className="py-3 flex items-baseline justify-between gap-3 border-t border-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <div className="text-[1rem] text-foreground leading-snug">{o.topic || o.content}</div>
                      <div className="label mt-0.5">
                        {CATEGORY_LABELS[o.category] ?? o.category}
                        {sub ? ` · ${sub}` : ""}
                      </div>
                    </div>
                    <div className="flex-none text-[0.875rem] tnum text-muted-foreground">
                      Confidence {o.confidence} of 5
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="text-[0.875rem] leading-[1.55] text-muted-foreground pt-3 border-t border-white/[0.06]">
          Confidence only moves when the same thing shows up again, across chat, footage or
          calibration. Nothing here is estimated.
        </p>
      </div>
    </section>
  );
}
