import { db, fightersTable, usersTable, FIGHTER_NAME_MAX, type Fighter } from "@workspace/db";
import { eq } from "drizzle-orm";

// Sign-up collects only name, email and password. Every account still gets a fighter row straight
// away, with the name and every answer blank, so `fighter` is never null after login and the
// onboarding questions can be answered later (Profile tab) with PATCH /fighter.

/** What a stub fighter row holds: a name and nothing else. Exported so tests pin the contract. */
export function stubFighterValues(name: string) {
  return {
    name,
    age: 0,
    dateOfBirth: null,
    art: "",
    primarySport: "",
    level: "",
    trainingFrequency: "",
    goals: "",
    weaknesses: "",
    personality: "",
    onboardingAnswers: {} as Record<string, number>,
  };
}

/** Sign-up name, else the account's stored display name, else the part of the email before "@". */
export function stubName(signUpName: string | null | undefined, displayName: string | null | undefined, email: string | null | undefined): string {
  const pick = [signUpName, displayName, email?.split("@")[0]].map((s) => (s ?? "").trim()).find(Boolean);
  return (pick || "Athlete").slice(0, FIGHTER_NAME_MAX);
}

/**
 * The user's fighter row, created as a blank stub when there is none. Idempotent and race-safe:
 * `fighters.user_id` is unique, so two concurrent callers insert once and both read that row.
 * Returns null only when the user row itself does not exist.
 */
export async function ensureFighter(userId: string, signUpName?: string | null): Promise<Fighter | null> {
  const read = async () => {
    const [row] = await db.select().from(fightersTable).where(eq(fightersTable.userId, userId)).limit(1);
    return row ?? null;
  };
  const existing = await read();
  if (existing) return existing;

  const [user] = await db
    .select({ email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return null;

  const [created] = await db
    .insert(fightersTable)
    .values({ userId, ...stubFighterValues(stubName(signUpName, user.displayName, user.email)) })
    .onConflictDoNothing({ target: fightersTable.userId })
    .returning();
  return created ?? (await read());
}
