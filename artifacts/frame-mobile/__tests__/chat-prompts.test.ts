import { describe, expect, it } from "vitest";
import { ANALYSE_SESSION_PROMPT, REGULATE_PROMPT } from "../lib/chat-prompts";
import { GLOSSARY, GLOSSARY_KEYS, isBrandMention } from "../lib/glossary";

describe("exact prompt wording from the client's brief", () => {
  it("regulation prompt", () => {
    expect(REGULATE_PROMPT).toBe("I need to regulate right now. Prescribe me a regulation protocol.");
  });
  it("analyse session prompt", () => {
    expect(ANALYSE_SESSION_PROMPT).toBe(
      "Break down my last session. Where did I lose composure, what held up under pressure, and what should I work on next?",
    );
  });
});

// The chat UI matches glossary terms case-insensitively; isBrandMention is the guard it applies.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function glossTerms(text: string): string[] {
  const re = new RegExp(`\\b(${GLOSSARY_KEYS.map(esc).join("|")})\\b`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (GLOSSARY[m[1]!.toLowerCase()] && !isBrandMention(m[1]!)) out.push(m[1]!);
  }
  return out;
}

describe("the glossary does not define FRAME the app", () => {
  it("brand references never open the 'frame' definition", () => {
    for (const t of [
      "FRAME is built for fighters.",
      "Open FRAME and log a check-in.",
      "FRAME's coach reads your notes.",
      "FRAME+ unlocks the full week.",
      "Frame is your corner team.",
    ]) {
      expect(glossTerms(t).map((x) => x.toLowerCase())).not.toContain("frame");
    }
  });
  it("the fighting term still works in lowercase, and other terms are untouched", () => {
    expect(glossTerms("Keep a frame against the shoulder.")).toEqual(["frame"]);
    expect(glossTerms("Composure and regulation under pressure.")).toEqual(["Composure", "regulation"]);
  });
});
