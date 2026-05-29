import { useState } from "react";
import { DrillCard, type Drill } from "./drill-card";
import { GLOSSARY, GLOSSARY_KEYS } from "@/lib/glossary";

type Segment =
  | { kind: "text"; text: string }
  | { kind: "drill"; drill: Drill; raw: string };

function segment(content: string): Segment[] {
  const out: Segment[] = [];
  const re = /```drill\s*\n([\s\S]*?)\n?```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: content.slice(last, m.index) });
    }
    const raw = m[1] ?? "";
    let drill: Drill = {};
    try {
      drill = JSON.parse(raw) as Drill;
    } catch {
      // not valid yet (mid-stream) — render as code-ish placeholder text
      out.push({ kind: "text", text: "```drill\n" + raw + "\n```" });
      last = re.lastIndex;
      continue;
    }
    out.push({ kind: "drill", drill, raw });
    last = re.lastIndex;
  }
  if (last < content.length) {
    out.push({ kind: "text", text: content.slice(last) });
  }
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One combined regex for all glossary terms, longest-first, word-bounded.
const GLOSSARY_RE = new RegExp(
  `\\b(${GLOSSARY_KEYS.map(escapeRe).join("|")})\\b`,
  "gi",
);

function Glossable({ term, gloss }: { term: string; gloss: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glossable"
        aria-expanded={open}
      >
        {term}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 bottom-full z-20 mb-1 w-60 max-w-[70vw] rounded-sm border border-primary/30 bg-popover px-3 py-2 text-[0.78rem] leading-snug text-foreground/90 shadow-lg"
        >
          <span className="block font-mono text-[9px] uppercase tracking-widest text-primary/70 mb-1">
            {term}
          </span>
          {gloss}
        </span>
      )}
    </span>
  );
}

// Split a plain text run into spans, wrapping any glossary term in a Glossable.
function withGlossary(text: string, baseKey: string) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  GLOSSARY_RE.lastIndex = 0;
  let i = 0;
  while ((m = GLOSSARY_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const matched = m[0];
    const gloss = GLOSSARY[matched.toLowerCase()];
    if (gloss) {
      nodes.push(<Glossable key={`${baseKey}-g-${i}`} term={matched} gloss={gloss} />);
    } else {
      nodes.push(matched);
    }
    last = m.index + matched.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderInline(text: string, baseKey: string) {
  // [[concept]] and **bold**
  const parts = text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const key = `${baseKey}-${i}`;
    if (p.startsWith("[[") && p.endsWith("]]")) {
      return (
        <span key={key} className="synochi-concept">
          {p.slice(2, -2)}
        </span>
      );
    }
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={key}>{withGlossary(p, key)}</span>;
  });
}

function renderText(text: string, baseKey: string) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  return paragraphs.map((p, i) => {
    const key = `${baseKey}-p-${i}`;
    const lines = p.split("\n");
    const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
    if (isList) {
      return (
        <ul key={key} className="list-disc pl-5 space-y-1.5 marker:text-primary/50">
          {lines.map((l, j) => (
            <li key={`${key}-li-${j}`} className="leading-relaxed text-[0.95rem]">
              {renderInline(l.replace(/^\s*[-*]\s+/, ""), `${key}-li-${j}`)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={key} className="leading-relaxed text-[0.95rem] whitespace-pre-wrap">
        {renderInline(p, key)}
      </p>
    );
  });
}

export function MessageContent({ content }: { content: string }) {
  const segs = segment(content);
  return (
    <div className="space-y-4">
      {segs.map((s, i) =>
        s.kind === "text" ? (
          <div key={i} className="space-y-3">
            {renderText(s.text, `seg-${i}`)}
          </div>
        ) : (
          <DrillCard key={i} drill={s.drill} />
        ),
      )}
    </div>
  );
}
