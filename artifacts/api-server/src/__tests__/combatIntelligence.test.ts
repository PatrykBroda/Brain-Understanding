import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { COMBAT_NOTES } from "../lib/combat.generated";
import {
  COMBAT_BUDGET_TOKENS,
  COMBAT_NOTE_MAX_CHARS,
  combatContextBlock,
  combatPickTokens,
  headOfNote,
  selectCombatNotes,
} from "../lib/combatIntelligence";
import { SYNOCHI_VAULT } from "../lib/synochi.generated";

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../knowledge/knowledge-manifest.json"), "utf8")) as {
  summary: Record<string, number>;
  notes: { path: string; status: string; analysis: string; reasons: string[] }[];
};

const QUERIES = [
  { kind: "padwork", sport: "kickboxing", focus: "distance and exits", signalText: "guard height drops after combinations; exit angle narrow" },
  { kind: "sparring", sport: "bjj", focus: "guard retention", signalText: "hips square to the passer; base narrows when pressured" },
  { kind: "drilling", sport: "boxing", focus: "", signalText: "stance width varies; pacing in bursts" },
  { kind: "shadowboxing", sport: "muay_thai", focus: "kicks", signalText: "balance drifts forward on the rear kick" },
];

describe("Combat Intelligence for video analysis", () => {
  it("is available: the pool is the manifest's analysis set, and nothing held back is in it", () => {
    const available = new Set(manifest.notes.filter((n) => n.analysis.startsWith("available")).map((n) => n.path));
    expect(COMBAT_NOTES.length).toBe(available.size);
    for (const n of COMBAT_NOTES) expect(available.has(n.path)).toBe(true);
    const held = manifest.notes.filter((n) => n.status === "excluded" || n.status === "not-used").map((n) => n.path);
    const pool = new Set(COMBAT_NOTES.map((n) => n.path));
    for (const p of held) expect(pool.has(p)).toBe(false);
    // The truncated note and the history notes are held back, with reasons.
    const truncated = manifest.notes.find((n) => n.path.endsWith("Strength Pattern Identification.md"))!;
    expect(truncated.status).toBe("excluded");
    expect(truncated.reasons.join(" ")).toMatch(/mid-sentence/);
    expect(COMBAT_NOTES.some((n) => n.folder === "Historical Context")).toBe(false);
  });

  it("the manifest accounts for every note in the supplied package, with the empty and wrong-content ones excluded and explained", () => {
    expect(manifest.summary.notes).toBe(928);
    const byPath = new Map(manifest.notes.map((n) => [n.path, n]));
    for (const p of [
      "Interaction Psychology/Social Dominance Circuits.md",
      "MODELS/Power Threshold.md",
      "MODELS/State Shapes Performance.md",
      "PROTOCOLS/Physiological Regulation.md",
      "SPINE/Spine Rule.md",
    ]) {
      expect(byPath.get(p)?.status).toBe("excluded");
      expect(byPath.get(p)?.reasons.join(" ")).toMatch(/empty/);
    }
    for (const p of ["MECHANISMS/Functional vs Trusted Capacity.md", "MODELS/Relationship Compunding.md"]) {
      expect(byPath.get(p)?.status).toBe("excluded");
      expect(byPath.get(p)?.reasons.join(" ")).toMatch(/wrong content/);
    }
    expect(manifest.notes.some((n) => n.path.startsWith("Documentation/"))).toBe(false);
  });

  it("stays inside the token budget for every kind of clip, and every pick is within its per-note cap", () => {
    for (const q of QUERIES) {
      const picks = selectCombatNotes(q);
      expect(picks.length).toBeGreaterThan(1);
      expect(picks.length).toBeLessThanOrEqual(8);
      expect(combatPickTokens(picks)).toBeLessThanOrEqual(COMBAT_BUDGET_TOKENS + 8);
      for (const p of picks) expect(p.excerpt.length).toBeLessThanOrEqual(COMBAT_NOTE_MAX_CHARS);
      expect(combatContextBlock(picks).length / 4).toBeLessThan(COMBAT_BUDGET_TOKENS + 400);
    }
  });

  it("always opens with the operating definition, and is deterministic", () => {
    const a = selectCombatNotes(QUERIES[0]!);
    const b = selectCombatNotes(QUERIES[0]!);
    expect(a.map((p) => p.path)).toEqual(b.map((p) => p.path));
    expect(a[0]!.title).toMatch(/Operating Definition/);
  });

  it("is relevant to the clip: practical-feedback folders lead, and BJJ notes are not pulled into a pad session", () => {
    const pads = selectCombatNotes(QUERIES[0]!);
    expect(pads.some((p) => ["Drill Templates", "Diagnostic Patterns", "Video Observation Ontology"].includes(p.folder))).toBe(true);
    expect(pads.filter((p) => p.folder === "BJJ Intelligence")).toHaveLength(0);
    const roll = selectCombatNotes(QUERIES[1]!);
    expect(roll.some((p) => ["BJJ Intelligence", "Technique Schemas", "Combat Models", "Universal Concepts"].includes(p.folder))).toBe(true);
  });

  it("an empty query adds nothing beyond the definition rather than inventing relevance", () => {
    const picks = selectCombatNotes({ kind: "", sport: null, focus: "", signalText: "" });
    expect(picks.length).toBeLessThanOrEqual(1);
  });

  it("cuts at a paragraph boundary", () => {
    const t = "one one one.\n\ntwo two two two.\n\nthree three three three three.";
    expect(headOfNote(t, 40)).toBe("one one one.\n\ntwo two two two.");
    expect(headOfNote(t, 500)).toBe(t);
  });

  it("the always-loaded chat vault no longer carries empty stubs", () => {
    expect(SYNOCHI_VAULT).not.toContain("### Synochi\n[[Central Axis]]");
  });
});
