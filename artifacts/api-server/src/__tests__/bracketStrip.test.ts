import { describe, expect, it } from "vitest";
import { createBracketStripper, stripBracketNodes } from "../lib/bracketStrip";
import { computeVocabulary } from "../lib/vocabulary";
import { COACH_SYSTEM_PROMPT_STATIC } from "../lib/synochi";


const stream = (parts: string[]) => {
  const s = createBracketStripper();
  return parts.map((p) => s.push(p)).join("") + s.flush();
};

describe("tier-0 bracket stripping", () => {
  it("unwraps node references", () => {
    expect(stripBracketNodes("Try [[KAIZEN - Stability-first progression]] today")).toBe(
      "Try KAIZEN - Stability-first progression today",
    );
    expect(stripBracketNodes("see [[Frame Integrity|your frame]]")).toBe("see your frame");
  });
  it("is safe when a bracket pair is split across stream chunks", () => {
    const out = stream(["Try [", "[KAIZEN - Sta", "bility-first]", "] today"]);
    expect(out).toBe("Try KAIZEN - Stability-first today");
    expect(out).not.toMatch(/[\[\]]/);
  });
  it("never emits a half-open bracket mid-stream", () => {
    const s = createBracketStripper();
    expect(s.push("hello [[KAIZ")).toBe("hello ");
    expect(s.push("EN]] ok")).toBe("KAIZEN ok");
  });
  it("leaves ordinary brackets and text alone, and drops a dangling opener on flush", () => {
    expect(stream(["array[0] and (note)"])).toBe("array[0] and (note)");
    expect(stream(["trailing [[unclosed"])).toBe("trailing unclosed");
  });
});

describe("tier-0 prompt guidance", () => {
  it("forbids bracket notation for a new athlete and allows it to scale in", () => {
    const g0 = computeVocabulary([]).guidance;
    expect(g0).toMatch(/never write \[\[double-bracket\]\]/);
    expect(computeVocabulary([]).tier).toBe(0);
  });
});

describe("coach system prompt rules", () => {
  it("has an abuse rule and caveats bracket notation by tier", () => {
    expect(COACH_SYSTEM_PROMPT_STATIC).toMatch(/never agree with it, endorse it, or joke along/);
    expect(COACH_SYSTEM_PROMPT_STATIC).toMatch(/tier 0\) NEVER use \[\[ \]\]/);
  });
});
