import type { TextInputProps } from "react-native";

/**
 * Keyboard behaviour per kind of field. Every free-text field spreads one of these explicitly
 * instead of relying on the platform default (iPhone autocorrect did not kick in for users).
 */
type Kind = Pick<TextInputProps, "autoCorrect" | "spellCheck" | "autoCapitalize">;

/** Sentences the user writes: chat, notes, goals, objectives. */
export const FREE_TEXT: Kind = { autoCorrect: true, spellCheck: true, autoCapitalize: "sentences" };

/** Short labels in normal words (event, discipline, weight class, place): corrected, each word capitalised. */
export const LABEL_TEXT: Kind = { autoCorrect: true, spellCheck: true, autoCapitalize: "words" };

/** People and organisations: capitalised, never autocorrected (it mangles names). */
export const NAME_TEXT: Kind = { autoCorrect: false, spellCheck: false, autoCapitalize: "words" };

/** Dates, times, numbers, emails, passwords, codes, URLs: left exactly as typed. */
export const RAW_TEXT: Kind = { autoCorrect: false, spellCheck: false, autoCapitalize: "none" };
