// Where do people drop off: sign-up, then the Profile onboarding questions?
//
//   DATABASE_URL=postgres://... pnpm --filter @workspace/scripts run onboarding-funnel
//   ... run onboarding-funnel -- --json     (machine-readable)
//
// Read-only. Prints, per app, how many distinct people reached each step and
// how many stopped there (the same numbers as GET /api/admin/onboarding-funnel).
// Needs the onboarding_events table (lib/db/migrations/0007_onboarding_events.sql).
import { db, pool, onboardingEventsTable } from "@workspace/db";
import { buildFunnel, formatFunnel } from "@workspace/onboarding";

async function main() {
  const rows = await db
    .select({
      userId: onboardingEventsTable.userId,
      app: onboardingEventsTable.app,
      step: onboardingEventsTable.step,
      event: onboardingEventsTable.event,
    })
    .from(onboardingEventsTable);

  const report = buildFunnel(rows);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ events: rows.length, funnel: report }, null, 2));
  } else {
    console.log(`${rows.length} onboarding events\n`);
    console.log(formatFunnel(report));
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
