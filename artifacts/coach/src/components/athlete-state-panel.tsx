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
    <div className="px-5 py-4 flex items-start justify-between gap-4" title={title}>
      <div className="eyebrow pt-1.5 flex-none w-28">{label}</div>
      <div className="min-w-0 text-right">
        <div className="font-display text-[1.05rem] leading-tight text-[#f1ede6] truncate">
          {value}
        </div>
        {sub && (
          <div className="text-xs text-muted-foreground mt-1 leading-snug">
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
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <div className="eyebrow eyebrow-gold">Athlete state</div>
        <span className="chip !px-2.5 !py-1 !text-[10px] !text-muted-foreground">Real signal only</span>
      </div>

      <div className="divide-y divide-white/10">
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
