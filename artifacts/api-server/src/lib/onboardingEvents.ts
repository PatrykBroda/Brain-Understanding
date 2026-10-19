import { db, onboardingEventsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  isApp,
  questionnaireAnswered,
  type QuestionnaireFighter,
  type FunnelEventRow,
  type OnboardingApp,
  type OnboardingEventType,
} from "@workspace/onboarding";

// Funnel tracking is analytics only. Every helper here swallows its own errors:
// a database hiccup or a missing table (migration not run yet) must never break
// sign-up or onboarding.

type Logger = { warn: (obj: unknown, msg?: string) => void };

/** Insert one event. Returns false (never throws) if it could not be stored. */
export async function recordOnboardingEvent(
  userId: string,
  app: OnboardingApp,
  step: string,
  event: OnboardingEventType,
  log?: Logger,
): Promise<boolean> {
  try {
    await db.insert(onboardingEventsTable).values({ userId, app, step, event });
    return true;
  } catch (err) {
    log?.warn({ err }, "onboarding event not recorded");
    return false;
  }
}

/** The app a person has been onboarding on, from their most recent event (null if none). */
export async function appForUser(userId: string): Promise<OnboardingApp | null> {
  try {
    const [row] = await db
      .select({ app: onboardingEventsTable.app })
      .from(onboardingEventsTable)
      .where(eq(onboardingEventsTable.userId, userId))
      .orderBy(desc(onboardingEventsTable.id))
      .limit(1);
    return row && isApp(row.app) ? row.app : null;
  } catch {
    return null;
  }
}

/** Account created. `appRaw` is whatever the client put in the register body; ignored unless valid. */
export async function recordSignup(userId: string, appRaw: unknown, log?: Logger): Promise<void> {
  if (!isApp(appRaw)) return;
  await recordOnboardingEvent(userId, appRaw, "signup", "complete", log);
}

/**
 * The athlete's required answers (date of birth, sport, level, frequency) are all present for the first
 * time = questionnaire finished. Recorded once per athlete, attributed to the app they were using.
 */
export async function recordFinish(userId: string, log?: Logger): Promise<void> {
  try {
    const [done] = await db
      .select({ id: onboardingEventsTable.id })
      .from(onboardingEventsTable)
      .where(and(eq(onboardingEventsTable.userId, userId), eq(onboardingEventsTable.step, "finish")))
      .limit(1);
    if (done) return;
  } catch (err) {
    log?.warn({ err }, "onboarding finish lookup failed");
    return;
  }
  const app = await appForUser(userId);
  if (!app) return;
  await recordOnboardingEvent(userId, app, "finish", "complete", log);
}

/** Call after a fighter write: records `finish` when this write is what completed the required answers. */
export async function recordFinishIfCompleted(
  userId: string,
  before: QuestionnaireFighter | null | undefined,
  after: QuestionnaireFighter | null | undefined,
  log?: Logger,
): Promise<void> {
  if (!questionnaireAnswered(before) && questionnaireAnswered(after)) await recordFinish(userId, log);
}

/** Every event, as the funnel aggregator wants it. Throws on database errors (callers decide). */
export async function loadFunnelRows(): Promise<FunnelEventRow[]> {
  return db
    .select({
      userId: onboardingEventsTable.userId,
      app: onboardingEventsTable.app,
      step: onboardingEventsTable.step,
      event: onboardingEventsTable.event,
    })
    .from(onboardingEventsTable);
}
