import { useFrameState } from "@/hooks/use-frame-state";
import { useActiveCompetition } from "@/hooks/use-competition";
import { computeCoachingMode } from "@workspace/archetypes";
import { primaryFocus } from "@/lib/primary-focus";
import type { Fighter, AthleteFact } from "@/lib/api";

// Honest Athlete State — a single card of REAL signal only. Every row is either
// derived from recorded facts / scheduled data, or it honestly says "not yet".
// Deliberately NO motivation score, recovery %, readiness index, or training
// load — those would be fabricated. This is the no-fake-biometrics pillar.

function Row({
  label,
  value,
  sub,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-4" title={title}>
      <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70 pt-0.5 flex-none w-28">
        {label}
      </div>
      <div className="min-w-0 text-right">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-foreground/95 truncate">
          {value}
        </div>
        {sub && (
          <div className="font-mono text-[9px] tracking-wide text-muted-foreground/55 mt-1 normal-case leading-snug">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function AthleteStatePanel({
  fighter,
  facts,
}: {
  fighter: Fighter;
  facts: AthleteFact[];
}) {
  const state = useFrameState();
  const compQuery = useActiveCompetition();
  const pressure = compQuery.data?.pressure ?? null;

  const mode = computeCoachingMode({
    hasActiveCompetition: !!compQuery.data?.competition,
    level: fighter.level,
    modelSize: facts.length,
  });

  const focus = primaryFocus(fighter, facts);

  const comp = pressure
    ? {
        value: `${pressure.daysToEvent}d · ${pressure.tierLabel}`,
        sub: pressure.competition.eventName,
      }
    : { value: "None scheduled", sub: undefined as string | undefined };

  return (
    <div
      className="profile-id-card"
      style={{ border: "1px solid hsla(0,0%,100%,0.08)" }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
          Athlete state
        </div>
        <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/55">
          Real signal only
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.05)" }}>
        <Row
          label="State"
          value={state.label}
          sub={state.source}
          title={state.source}
        />
        <Row
          label="Coaching mode"
          value={mode.label}
          sub={mode.focus}
          title={mode.needs}
        />
        <Row label="Competition" value={comp.value} sub={comp.sub} />
        <Row
          label="Primary focus"
          value={focus.label}
          sub={focus.source}
          title={focus.source}
        />
      </div>
    </div>
  );
}
