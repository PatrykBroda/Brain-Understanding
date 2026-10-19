// Builds the Combat Intelligence set that VIDEO ANALYSIS may draw on, and the knowledge manifest.
//
//   node build-combat.mjs [--package <path to the supplied Knowledge/ folder>]
//
// Writes:
//   src/lib/combat.generated.ts      the included notes (path, folder, title, body)  -> imported by the server
//   knowledge/knowledge-manifest.json  every note, its status and WHY (machine readable)
//   knowledge/knowledge-manifest.md    the same, summarised for people
//
// Policy (from the vault author's Stage 1 handoff and Unresolved Issues, 2026-10-07/08):
//   - Documentation/ is never knowledge. Only Knowledge/ is considered.
//   - Empty notes are excluded (nothing is invented to fill them).
//   - Notes whose bytes duplicate another note's are "wrong-content destinations": the later path is excluded.
//   - Notes the vault author lists as unresolved (truncated, competing authority) are excluded from the
//     runtime until reviewed; they stay in the manifest with the reason.
//   - Combat Intelligence is a specialist layer: only video analysis reads it, through a token budget
//     (see src/lib/combatIntelligence.ts). Historical Context (origins of the arts) is not coaching
//     knowledge for reading footage and is excluded from that set.
//   - CRICKET INTELLIGENCE (3 notes, not a complete layer), FRAME IP.md (product reference, runtime
//     suitability not presumed) are not read by any runtime.
//   - Chat's behaviour is unchanged by this script: its always-loaded and on-demand sets come from
//     build-synochi.mjs. The manifest records which of them each note belongs to.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.resolve(here, "src/synochi");
const OUT_TS = path.resolve(here, "src/lib/combat.generated.ts");
const OUT_DIR = path.resolve(here, "knowledge");

const argv = process.argv.slice(2);
const pkgIdx = argv.indexOf("--package");
const PACKAGE_DIR = pkgIdx >= 0 ? path.resolve(argv[pkgIdx + 1]) : null;

const CHAT_FULL = new Set(["SPINE", "IDENTITY", "PROTOCOLS", "Interaction Psychology", "Guidance Dynamics"]);
const CHAT_DEEP = new Set(["MODELS", "MECHANISMS"]);
const COMBAT_ROOT = "COMBAT INTELLIGENCE";
const COMBAT_EXCLUDED_FOLDERS = new Map([
  ["Historical Context", "history of the arts: not coaching knowledge for reading footage"],
]);

// Listed in the vault author's Unresolved Issues. Path -> why it is held back.
const REVIEW_REQUIRED = new Map([
  ["COMBAT INTELLIGENCE/Diagnostic Patterns/Strength Pattern Identification.md", "review-required: ends mid-sentence (\"…a highly reliable strength that\"), continuation missing (Unresolved Issues #2)"],
  ["MECHANISMS/Functional vs Trusted Capacity.md", "wrong content: byte-identical to MECHANISMS/Opponent Realisation.md (Unresolved Issues #1)"],
  ["MODELS/Relationship Compunding.md", "wrong content: byte-identical to MODELS/Operator Layer Acquisition.md (Unresolved Issues #1)"],
]);
const FLAGGED_NOT_EXCLUDED = new Map([
  ["SPINE/ Stability-First Progression.md", "competing authority with the other two Stability-First Progression notes (Unresolved Issues #3); unchanged in chat, not used by analysis"],
  ["SPINE/Stability-First Progression.md", "competing authority (Unresolved Issues #3); unchanged in chat, not used by analysis"],
  ["SPINE/KAIZEN - Stability-first progression.md", "competing authority (Unresolved Issues #3); unchanged in chat, not used by analysis"],
  ["MODELS/Adaptive Friction Scaling.md", "overlaps its Spine Law version; pressure/withholding language not reconciled with Agency Preservation (Unresolved Issues #6)"],
  ["COMBAT INTELLIGENCE/Diagnostic Patterns/State-Dependent Performance.md", "general causal language must not override this diagnostic's observation/causation boundary (Unresolved Issues #5): included, quoted as a boundary"],
]);

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.name.endsWith(".md")) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const clean = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n").trim();
const nonSpace = (s) => s.replace(/\s+/g, "").length;

const files = walk(VAULT);
const rows = [];
const seen = new Map(); // content hash -> first path
for (const rel of files) {
  const buf = readFileSync(path.join(VAULT, rel));
  const text = clean(buf);
  const hash = sha(Buffer.from(text, "utf8"));
  const parts = rel.split("/");
  const folder = parts[0];
  const row = {
    path: rel,
    folder,
    subfolder: folder === COMBAT_ROOT ? (parts.length > 2 ? parts[1] : "(root)") : null,
    bytes: buf.length,
    sha256: sha(buf),
    chat: null,
    analysis: "not-used",
    status: "included",
    reasons: [],
  };
  if (CHAT_FULL.has(folder)) row.chat = "always-loaded (opening kept in the prompt, long tail on demand)";
  else if (CHAT_DEEP.has(folder)) row.chat = "on-demand retrieval";

  let excluded = null;
  if (nonSpace(text) < 40) excluded = "empty note (nothing is invented to fill it)";
  else if (REVIEW_REQUIRED.has(rel)) excluded = REVIEW_REQUIRED.get(rel);
  else if (seen.has(hash) && !rel.startsWith(COMBAT_ROOT)) excluded = `duplicate content of ${seen.get(hash)} (wrong-content destination)`;
  if (!seen.has(hash)) seen.set(hash, rel);

  if (excluded) {
    row.status = "excluded";
    row.reasons.push(excluded);
    row.chat = null;
  }
  if (FLAGGED_NOT_EXCLUDED.has(rel)) row.reasons.push(`flagged: ${FLAGGED_NOT_EXCLUDED.get(rel)}`);

  // Video analysis set
  if (folder === COMBAT_ROOT) {
    if (row.status === "excluded") row.analysis = "excluded";
    else if (COMBAT_EXCLUDED_FOLDERS.has(row.subfolder)) {
      row.analysis = "excluded";
      row.status = "excluded";
      row.reasons.push(COMBAT_EXCLUDED_FOLDERS.get(row.subfolder));
    } else row.analysis = "available (selected per clip within a token budget)";
  } else if (rel === "Recognition Decision Drill.md" && row.status === "included") {
    row.analysis = "available (root drill template; selected per clip within a token budget)";
  } else if (folder === "CRICKET INTELLIGENCE") {
    row.status = row.status === "excluded" ? "excluded" : "not-used";
    row.reasons.push("limited source (3 notes), not a complete specialist layer: not read by any runtime");
  } else if (rel === "FRAME IP.md") {
    row.status = "not-used";
    row.reasons.push("product reference; runtime suitability not presumed (Stage 1 handoff)");
  }
  row.chars = text.length;
  rows.push({ ...row, _text: text });
}

// Optional: compare against the supplied package.
let packageDiff = null;
if (PACKAGE_DIR) {
  const pkg = new Map();
  for (const rel of walk(PACKAGE_DIR)) pkg.set(rel, sha(readFileSync(path.join(PACKAGE_DIR, rel))));
  const repo = new Map(rows.map((r) => [r.path, r.sha256]));
  packageDiff = {
    packageNotes: pkg.size,
    repoNotes: repo.size,
    inPackageNotInRepo: [...pkg.keys()].filter((k) => !repo.has(k)),
    inRepoNotInPackage: [...repo.keys()].filter((k) => !pkg.has(k)),
    changedBytes: [...pkg.keys()].filter((k) => repo.has(k) && repo.get(k) !== pkg.get(k)),
  };
  // Notes in the package that the repo (rightly) does not carry: list them with the reason, so the
  // manifest accounts for all of the package, not only for what is built.
  const repoHashes = new Map(rows.map((r) => [sha(Buffer.from(r._text, "utf8")), r.path]));
  for (const rel of packageDiff.inPackageNotInRepo) {
    const buf = readFileSync(path.join(PACKAGE_DIR, rel));
    const text = clean(buf);
    const twin = repoHashes.get(sha(Buffer.from(text, "utf8")));
    const reason = nonSpace(text) < 40
      ? "empty note (nothing is invented to fill it)"
      : REVIEW_REQUIRED.get(rel) ?? (twin ? `wrong content: byte-identical to ${twin} (Unresolved Issues #1)` : "not carried: not in the repo vault");
    rows.push({
      path: rel,
      folder: rel.split("/")[0],
      subfolder: null,
      bytes: buf.length,
      sha256: sha(buf),
      chat: null,
      analysis: "excluded",
      status: "excluded",
      reasons: [reason, "present in the supplied package only"],
      chars: text.length,
      _text: "",
    });
  }
}

// ---- generated module: the analysis set ----
const included = rows.filter((r) => r.analysis.startsWith("available"));
const notes = included.map((r) => ({
  path: r.path,
  folder: r.subfolder === "(root)" || r.subfolder == null ? "Drill Templates" : r.subfolder,
  title: path.basename(r.path, ".md"),
  body: r._text,
}));
const ts =
  `// AUTO-GENERATED by build-combat.mjs from src/synochi/COMBAT INTELLIGENCE (+ the root drill template). Do not edit by hand.\n` +
  `// What is in here, and why anything is not: knowledge/knowledge-manifest.md\n` +
  `export interface CombatNote { path: string; folder: string; title: string; body: string }\n` +
  `export const COMBAT_NOTES: CombatNote[] = ${JSON.stringify(notes)};\n`;
const tmp = `${OUT_TS}.tmp-${process.pid}`;
writeFileSync(tmp, ts);
import("node:fs").then(({ renameSync }) => renameSync(tmp, OUT_TS));

// ---- manifest ----
mkdirSync(OUT_DIR, { recursive: true });
const pub = rows.map(({ _text, ...r }) => r);
const count = (f) => pub.filter(f).length;
const summary = {
  notes: pub.length,
  chatAlwaysLoaded: count((r) => r.chat?.startsWith("always")),
  chatOnDemand: count((r) => r.chat === "on-demand retrieval"),
  analysisAvailable: count((r) => r.analysis.startsWith("available")),
  excluded: count((r) => r.status === "excluded"),
  notUsed: count((r) => r.status === "not-used"),
  empty: count((r) => r.reasons.some((x) => x.startsWith("empty"))),
  reviewRequiredOrWrongContent: count((r) => r.reasons.some((x) => /^review-required|^wrong content|duplicate content/.test(x))),
  historicalExcludedFromAnalysis: count((r) => r.reasons.some((x) => x.startsWith("history of the arts"))),
  combatNotesTotal: count((r) => r.folder === COMBAT_ROOT),
  combatNotesAvailableToAnalysis: count((r) => r.folder === COMBAT_ROOT && r.analysis.startsWith("available")),
  analysisCharsTotal: included.reduce((n, r) => n + r._text.length, 0),
};
writeFileSync(path.join(OUT_DIR, "knowledge-manifest.json"), JSON.stringify({ policy: "see header of build-combat.mjs", summary, packageDiff, notes: pub }, null, 2) + "\n");

const md = [];
md.push("# Knowledge manifest", "");
md.push("Generated by `build-combat.mjs`. Source of truth for what the runtime may read and why anything is held back.", "");
md.push("## Summary", "", "| | |", "|---|---|");
for (const [k, v] of Object.entries(summary)) md.push(`| ${k} | ${v} |`);
if (packageDiff) {
  md.push("", "## Compared with the supplied package (Knowledge/, 2026-10-08)", "");
  md.push(`- package notes: ${packageDiff.packageNotes}; repo notes: ${packageDiff.repoNotes}`);
  md.push(`- in the package but not in the repo (${packageDiff.inPackageNotInRepo.length}): ${packageDiff.inPackageNotInRepo.map((x) => "`" + x + "`").join(", ") || "none"}`);
  md.push(`- in the repo but not in the package (${packageDiff.inRepoNotInPackage.length}): ${packageDiff.inRepoNotInPackage.map((x) => "`" + x + "`").join(", ") || "none"}`);
  md.push(`- same path, different bytes (${packageDiff.changedBytes.length}): ${packageDiff.changedBytes.map((x) => "`" + x + "`").join(", ") || "none"}`);
}
md.push("", "## Held back or flagged", "", "| path | status | why |", "|---|---|---|");
for (const r of pub.filter((r) => r.reasons.length)) md.push(`| ${r.path} | ${r.status} | ${r.reasons.join("; ").replace(/\|/g, "/")} |`);
md.push("", "## Video analysis set by folder", "", "| folder | notes available | chars |", "|---|---|---|");
const byFolder = new Map();
for (const r of included) byFolder.set(r.subfolder ?? "(root)", [(byFolder.get(r.subfolder ?? "(root)")?.[0] ?? 0) + 1, (byFolder.get(r.subfolder ?? "(root)")?.[1] ?? 0) + r._text.length]);
for (const [k, [n, c]] of [...byFolder.entries()].sort()) md.push(`| ${k} | ${n} | ${c} |`);
writeFileSync(path.join(OUT_DIR, "knowledge-manifest.md"), md.join("\n") + "\n");

console.log(`combat: ${included.length} notes available to video analysis (${summary.analysisCharsTotal} chars); ${summary.excluded} excluded, ${summary.notUsed} not used; manifest in knowledge/`);
if (packageDiff) console.log(`package diff: +${packageDiff.inPackageNotInRepo.length} -${packageDiff.inRepoNotInPackage.length} ~${packageDiff.changedBytes.length}`);
