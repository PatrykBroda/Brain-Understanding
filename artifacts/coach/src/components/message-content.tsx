import { createContext, useContext, useState } from "react";
import { DrillCard, type Drill } from "./drill-card";
import { BreathCard, type Breath } from "./breath-card";
import { RegulateSequence, type RegulateSequenceData } from "./regulate-sequence";
import { GLOSSARY, GLOSSARY_KEYS, isBrandMention, type GlossEntry } from "@/lib/glossary";

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
          className="overlay-surface absolute left-0 bottom-full z-20 mb-2 w-72 max-w-[78vw] rounded-[14px] px-4 py-3 text-[0.875rem] leading-[1.55] text-foreground/90"
        >
          <span className="block text-[0.8125rem] font-medium text-[#B9A477] mb-1">
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
                className="min-h-[32px] text-[0.8125rem] font-medium text-[#D4C7A3] hover:text-foreground transition-colors"
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
                className="min-h-[32px] text-[0.8125rem] font-medium text-[#D4C7A3] hover:text-foreground transition-colors"
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
    const entry = isBrandMention(matched) ? undefined : GLOSSARY[matched.toLowerCase()];
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
        <span key={key} className="synochi-concept !font-sans !text-[1em] !font-medium !rounded-md">
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
    const isNumbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    const heading = /^#{1,4}\s+/.test(p) && lines.length === 1;
    if (heading) {
      return (
        <h4 key={key} className="section-title !text-[1.0625rem] pt-2">
          {renderInline(p.replace(/^#{1,4}\s+/, ""), key)}
        </h4>
      );
    }
    if (isNumbered) {
      return (
        <ol key={key} className="space-y-3">
          {lines.map((l, j) => (
            <li key={`${key}-ol-${j}`} className="flex gap-3 text-[1.0625rem] leading-[1.7]">
              <span className="tnum mt-[3px] flex h-6 w-6 flex-none items-center justify-center rounded-lg border border-white/10 bg-[#191C20] text-[0.8125rem] font-medium text-[#D4C7A3]">
                {j + 1}
              </span>
              <span className="min-w-0 flex-1">{renderInline(l.replace(/^\s*\d+[.)]\s+/, ""), `${key}-ol-${j}`)}</span>
            </li>
          ))}
        </ol>
      );
    }
    if (isList) {
      return (
        <ul key={key} className="list-disc pl-5 space-y-2 marker:text-[#8A8F96]">
          {lines.map((l, j) => (
            <li key={`${key}-li-${j}`} className="leading-[1.7] text-[1.0625rem] pl-1">
              {renderInline(l.replace(/^\s*[-*]\s+/, ""), `${key}-li-${j}`)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={key} className="leading-[1.7] text-[1.0625rem] whitespace-pre-wrap">
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
      <div className="space-y-4 max-w-[68ch]">
        {segs.map((s, i) => {
          if (s.kind === "text") {
            return (
              <div key={i} className="space-y-4">
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
