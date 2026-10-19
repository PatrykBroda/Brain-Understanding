/** Matches FIGHTER_NAME_MAX in lib/db (the server rejects longer names). */
export const NAME_MAX = 60;

/** Inline error for the profile Name field, or null when the (trimmed) name is valid. */
export function nameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Enter your name";
  if (name.length > NAME_MAX) return `Keep it under ${NAME_MAX + 1} characters`;
  return null;
}
