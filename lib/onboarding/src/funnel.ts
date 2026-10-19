import { APPS, FLOWS, type OnboardingApp } from "./steps";

export type FunnelEventRow = { userId: string; app: string; step: string; event: string };

export type FunnelStepRow = {
  step: string;
  /** Distinct people who got at least this far. */
  reached: number;
  /** Reached this step and never got further (and never finished). */
  dropped: number;
  /** reached as a share of the first step, 0-100, one decimal. */
  pctOfStart: number;
  /** error events recorded on this step. */
  errors: number;
};

export type FunnelReport = {
  app: OnboardingApp;
  started: number;
  finished: number;
  steps: FunnelStepRow[];
};

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/**
 * Per app: how many distinct users reached each step and how many stopped there.
 * "Reached step i" = has any event at step i or LATER, so a person who resumed
 * from a saved draft (no 'view' on the earlier steps) is still counted as
 * having passed them. Unknown steps and apps are ignored.
 */
export function buildFunnel(rows: readonly FunnelEventRow[]): FunnelReport[] {
  return APPS.map((app) => {
    const flow = FLOWS[app];
    const idx = new Map(flow.map((s, i) => [s, i] as const));
    const last = flow.length - 1;
    const furthest = new Map<string, number>();
    const finished = new Set<string>();
    const errors = new Array<number>(flow.length).fill(0);

    for (const r of rows) {
      if (r.app !== app) continue;
      const i = idx.get(r.step);
      if (i === undefined) continue;
      if (r.event === "error") errors[i] += 1;
      furthest.set(r.userId, Math.max(furthest.get(r.userId) ?? 0, i));
      if (r.step === flow[last] && r.event === "complete") finished.add(r.userId);
    }

    const atExactly = new Array<number>(flow.length).fill(0);
    for (const [userId, i] of furthest) if (!finished.has(userId)) atExactly[i] += 1;

    const started = furthest.size;
    let reachedSoFar = started;
    const steps = flow.map((step, i) => {
      const reached = reachedSoFar;
      // Everyone whose furthest point was exactly this step stops being counted for the next one.
      reachedSoFar -= i === last ? 0 : atExactly[i];
      return {
        step,
        reached,
        dropped: i === last ? 0 : atExactly[i],
        pctOfStart: pct(reached, started),
        errors: errors[i],
      };
    });
    return { app, started, finished: finished.size, steps };
  });
}

/** Plain-text table of the report, for the script and for logs. */
export function formatFunnel(reports: readonly FunnelReport[]): string {
  const out: string[] = [];
  for (const r of reports) {
    out.push(`${r.app.toUpperCase()}  started ${r.started}  finished ${r.finished}  (${pct(r.finished, r.started)}%)`);
    out.push(`  ${"step".padEnd(14)}${"reached".padStart(8)}${"dropped".padStart(9)}${"% of start".padStart(12)}${"errors".padStart(8)}`);
    for (const s of r.steps) {
      out.push(
        `  ${s.step.padEnd(14)}${String(s.reached).padStart(8)}${String(s.dropped).padStart(9)}${(s.pctOfStart.toFixed(1) + "%").padStart(12)}${String(s.errors).padStart(8)}`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}
