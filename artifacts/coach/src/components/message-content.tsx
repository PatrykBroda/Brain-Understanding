import { createContext, useContext, useState } from "react";
import { DrillCard, type Drill } from "./drill-card";
import { BreathCard, type Breath } from "./breath-card";
import { RegulateSequence, type RegulateSequenceData } from "./regulate-sequence";
import { GLOSSARY, GLOSSARY_KEYS, type GlossEntry } from "@/lib/glossary";

type Segment =
  | { kind: "text"; text: string }
  | { kind: "drill"; drill: Drill; raw: string }
  | { kind: "breath"; breath: Breath; raw: string }
  | { kind: "regulate"; regulate: RegulateSequenceData; raw: string };

// Fenced blocks the UI renders as interactive cards.
const BLOCK_RE = /```(drill|breath|regulate)\s*\n([\s\S]*?)\n?```/g;

function segment(content: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: content.slice(last, m.index) });
    }
    const kind = m[1] as "drill" | "breath" | "regulate";
    const raw = m[2] ?? "";
    try {
      const parsed = JSON.parse(raw);
      if (kind === "drill") out.push({ kind: "drill", drill: parsed as Drill, raw });
      else if (kind === "regulate") out.push({ kind: "regulate", regulate: parsed as RegulateSequenceData, raw });
      else out.push({ kind: "breath", breath: parsed as Breath, raw });
    } catch {
      // not valid yet (mid-stream) — render as code-ish placeholder text
      out.push({ kind: "text", text: "```" + kind + "\n" + raw + "\n```" });
      last = BLOCK_RE.lastIndex;
      continue;
    }
    last = BLOCK_RE.lastIndex;
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

// Lets a glossary popover's "Train this" hand a prompt back to the chat input.
const TrainContext = createContext<((prompt: string) => void) | null>(null);

function Glossable({ term, entry }: { term: string; entry: GlossEntry }) {
  const [open, setOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const onTrain = useContext(TrainContext);

  const close = () => {
    setOpen(false);
    setShowWhy(false);
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="glossable"
        aria-expanded={open}
      >
        {term}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 bottom-full z-20 mb-1 w-64 max-w-[78vw] rounded-sm border border-primary/30 bg-popover px-3 py-2.5 text-[0.78rem] leading-snug text-foreground/90 shadow-lg"
        >
          <span className="block font-mono text-[9px] uppercase tracking-widest text-primary/70 mb-1">
            {term}
          </span>
          <span className="block">{entry.quick}</span>

          {showWhy && entry.why && (
            <span className="mt-2 block border-t border-border/40 pt-2 text-foreground/75">
              {entry.why}
            </span>
          )}

          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {entry.why && !showWhy && (
              <button
                type="button"
                onClick={() => setShowWhy(true)}
                className="font-mono text-[9px] uppercase tracking-widest text-primary/80 hover:text-primary transition-colors"
              >
                Why it matters
              </button>
            )}
            {entry.train && onTrain && (
              <button
                type="button"
                onClick={() => {
                  onTrain(entry.train!);
                  close();
                }}
                className="font-mono text-[9px] uppercase tracking-widest text-primary/80 hover:text-primary transition-colors"
              >
                Train this →
              </button>
            )}
          </span>
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
    const entry = GLOSSARY[matched.toLowerCase()];
    if (entry) {
      nodes.push(<Glossable key={`${baseKey}-g-${i}`} term={matched} entry={entry} />);
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

export function MessageContent({
  content,
  onTrain,
}: {
  content: string;
  onTrain?: (prompt: string) => void;
}) {
  const segs = segment(content);
  return (
    <TrainContext.Provider value={onTrain ?? null}>
      <div className="space-y-4">
        {segs.map((s, i) => {
          if (s.kind === "text") {
            return (
              <div key={i} className="space-y-3">
                {renderText(s.text, `seg-${i}`)}
              </div>
            );
          }
          if (s.kind === "breath") {
            return <BreathCard key={i} breath={s.breath} />;
          }
          if (s.kind === "regulate") {
            return <RegulateSequence key={i} data={s.regulate} />;
          }
          return <DrillCard key={i} drill={s.drill} />;
        })}
      </div>
    </TrainContext.Provider>
  );
}
