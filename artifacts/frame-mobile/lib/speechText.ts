// Turns a coach reply into plain text that sounds right when read aloud (pure, no React).

import { parseConceptRef, stripDanglingRef } from "./glossary";

/** Strip markdown, [[concept links]] and structured blocks (drill/breath/regulate) so only speech remains. */
export function speechText(content: string): string {
  let t = stripDanglingRef(content);
  t = t.replace(/```[\s\S]*?```/g, " "); // structured cards are visual; closed code fences
  t = t.replace(/```[\s\S]*$/, " "); // half-streamed fence
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => parseConceptRef(inner).display);
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " "); // images
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // [text](url)
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // headings
  t = t.replace(/^\s{0,3}>\s?/gm, ""); // quotes
  t = t.replace(/^\s*[-*+]\s+/gm, ""); // bullets
  t = t.replace(/^\s*\d+[.)]\s+/gm, ""); // numbered lists
  t = t.replace(/(\*\*|__)(.+?)\1/g, "$2"); // bold
  t = t.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?;:]|$)/g, "$1$2"); // italics
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/^\s*([-*_]\s*){3,}$/gm, " "); // rules
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\s*\n\s*/g, ". ").replace(/([.!?:;,])\.\s/g, "$1 "); // line breaks become pauses
  return t.replace(/\s+/g, " ").trim();
}

/** Speech engines cap utterance length; split on sentence ends into chunks under `max` chars. */
export function speechChunks(text: string, max = 3500): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
    if ((cur + sentence).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += sentence;
    while (cur.length > max) {
      out.push(cur.slice(0, max).trim());
      cur = cur.slice(max);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export type VoicePrefs = { enabled: boolean };
export const DEFAULT_VOICE_PREFS: VoicePrefs = { enabled: true };

export function parseVoicePrefs(raw: string | null | undefined): VoicePrefs {
  if (!raw) return { ...DEFAULT_VOICE_PREFS };
  try {
    const v = JSON.parse(raw) as { enabled?: unknown };
    return { enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_VOICE_PREFS.enabled };
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}
