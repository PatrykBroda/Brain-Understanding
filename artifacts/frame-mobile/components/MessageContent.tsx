import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { DrillCard, type Drill } from "@/components/DrillCard";
import { BreathCard, type Breath } from "@/components/BreathCard";
import { RegulateSequence, type RegulateSequenceData } from "@/components/RegulateSequence";
import { GLOSSARY, GLOSSARY_KEYS, type GlossEntry } from "@/lib/glossary";
import { fonts, palette, radius } from "@/constants/theme";

// ─── Block parsing ──────────────────────────────────────────────────────────
const BLOCK_RE = /```(drill|breath|regulate)\s*\n([\s\S]*?)\n?```/g;

type Segment =
  | { kind: "text"; text: string }
  | { kind: "drill"; data: Drill }
  | { kind: "breath"; data: Breath }
  | { kind: "regulate"; data: RegulateSequenceData }
  | { kind: "raw"; text: string };

function segment(content: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    if (m.index > last) {
      const text = content.slice(last, m.index);
      if (text.trim()) out.push({ kind: "text", text });
    }
    const lang = m[1];
    const body = m[2];
    try {
      const data = JSON.parse(body);
      if (lang === "drill") out.push({ kind: "drill", data });
      else if (lang === "breath") out.push({ kind: "breath", data });
      else out.push({ kind: "regulate", data });
    } catch {
      // mid-stream / malformed — show raw so nothing is hidden
      out.push({ kind: "raw", text: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    const text = content.slice(last);
    if (text.trim()) out.push({ kind: "text", text });
  }
  return out;
}

// ─── Inline tokenizing (concept / bold / glossary) ──────────────────────────
function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const GLOSS_RE = new RegExp(`\\b(${GLOSSARY_KEYS.map(esc).join("|")})\\b`, "gi");
const STRUCT_RE = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;

type Token =
  | { t: "plain"; v: string }
  | { t: "concept"; v: string }
  | { t: "bold"; v: string }
  | { t: "gloss"; v: string; entry: GlossEntry };

function glossSplit(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  GLOSS_RE.lastIndex = 0;
  while ((m = GLOSS_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ t: "plain", v: text.slice(last, m.index) });
    const entry = GLOSSARY[m[1].toLowerCase()];
    if (entry) out.push({ t: "gloss", v: m[1], entry });
    else out.push({ t: "plain", v: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push({ t: "plain", v: text.slice(last) });
  return out;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  STRUCT_RE.lastIndex = 0;
  while ((m = STRUCT_RE.exec(text)) !== null) {
    if (m.index > last) out.push(...glossSplit(text.slice(last, m.index)));
    if (m[1] != null) out.push({ t: "concept", v: m[1] });
    else if (m[2] != null) out.push({ t: "bold", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...glossSplit(text.slice(last)));
  return out;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function MessageContent({
  content,
  onTrain,
}: {
  content: string;
  onTrain?: (prompt: string) => void;
}) {
  const [active, setActive] = useState<{ term: string; entry: GlossEntry } | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  function openGloss(term: string, entry: GlossEntry) {
    setShowWhy(false);
    setActive({ term, entry });
  }

  function renderInline(text: string, keyBase: string) {
    return tokenize(text).map((tok, i) => {
      const k = `${keyBase}-${i}`;
      if (tok.t === "concept") return <Text key={k} style={s.concept}>{tok.v}</Text>;
      if (tok.t === "bold") return <Text key={k} style={s.bold}>{tok.v}</Text>;
      if (tok.t === "gloss")
        return (
          <Text key={k} style={s.gloss} onPress={() => openGloss(tok.v, tok.entry)}>
            {tok.v}
          </Text>
        );
      return <Text key={k}>{tok.v}</Text>;
    });
  }

  function renderText(text: string, keyBase: string) {
    const paras = text.split(/\n{2,}/).filter((p) => p.trim());
    return paras.map((para, pi) => {
      const lines = para.split("\n").filter((l) => l.trim());
      const isList = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l));
      if (isList) {
        return (
          <View key={`${keyBase}-p${pi}`} style={s.list}>
            {lines.map((l, li) => (
              <View key={li} style={s.listItem}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.paragraph}>
                  {renderInline(l.replace(/^\s*[-*]\s+/, ""), `${keyBase}-p${pi}-${li}`)}
                </Text>
              </View>
            ))}
          </View>
        );
      }
      return (
        <Text key={`${keyBase}-p${pi}`} style={[s.paragraph, pi > 0 && s.paragraphGap]}>
          {renderInline(para.replace(/\n/g, " "), `${keyBase}-p${pi}`)}
        </Text>
      );
    });
  }

  const segs = segment(content);

  return (
    <View>
      {segs.map((seg, i) => {
        if (seg.kind === "text") return <View key={i}>{renderText(seg.text, `t${i}`)}</View>;
        if (seg.kind === "raw")
          return (
            <Text key={i} style={s.paragraph}>
              {seg.text}
            </Text>
          );
        if (seg.kind === "drill") return <DrillCard key={i} drill={seg.data} />;
        if (seg.kind === "breath") return <BreathCard key={i} breath={seg.data} />;
        return <RegulateSequence key={i} data={seg.data} />;
      })}

      <Modal
        visible={!!active}
        transparent
        animationType="fade"
        onRequestClose={() => setActive(null)}
      >
        <Pressable style={s.backdrop} onPress={() => setActive(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {active && (
              <>
                <Text style={s.sheetTerm}>{active.term}</Text>
                <Text style={s.sheetQuick}>{active.entry.quick}</Text>

                {active.entry.why ? (
                  showWhy ? (
                    <View style={s.whyBlock}>
                      <Text style={s.whyLabel}>Why it matters</Text>
                      <Text style={s.whyText}>{active.entry.why}</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => setShowWhy(true)} style={s.linkBtn}>
                      <Text style={s.linkText}>Why it matters →</Text>
                    </Pressable>
                  )
                ) : null}

                {active.entry.train && onTrain ? (
                  <Pressable
                    style={s.trainBtn}
                    onPress={() => {
                      const prompt = active.entry.train!;
                      setActive(null);
                      onTrain(prompt);
                    }}
                  >
                    <Text style={s.trainText}>Train this →</Text>
                  </Pressable>
                ) : null}

                <Pressable style={s.closeBtn} onPress={() => setActive(null)}>
                  <Text style={s.closeText}>Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  paragraph: {
    fontFamily: fonts.text,
    fontSize: 15,
    lineHeight: 23,
    color: palette.text,
  },
  paragraphGap: {
    marginTop: 10,
  },
  bold: {
    color: palette.textHi,
    fontFamily: fonts.textSemi,
  },
  concept: {
    color: palette.goldLight,
    fontFamily: fonts.displayThin,
    fontSize: 12.5,
  },
  gloss: {
    color: palette.goldPale,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: palette.goldHair,
  },
  list: {
    marginTop: 6,
    gap: 4,
  },
  listItem: {
    flexDirection: "row",
    gap: 8,
  },
  bullet: {
    color: palette.goldLight,
    fontSize: 15,
    lineHeight: 23,
  },
  backdrop: {
    flex: 1,
    backgroundColor: palette.scrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: palette.graphite2,
    borderWidth: 1,
    borderColor: palette.goldHair,
    borderRadius: radius.lg,
    padding: 24,
  },
  sheetTerm: {
    fontFamily: fonts.displayThin,
    fontSize: 18,
    lineHeight: 22,
    color: palette.goldPale,
    marginBottom: 10,
  },
  sheetQuick: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: palette.text,
    lineHeight: 23,
  },
  whyBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  whyLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 12.5,
    letterSpacing: 1.6,
    color: palette.goldLight,
    marginBottom: 6,
  },
  whyText: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.textMid,
    lineHeight: 21,
  },
  linkBtn: {
    marginTop: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  linkText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 0.4,
    color: palette.goldLight,
  },
  trainBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
    paddingHorizontal: 22,
  },
  trainText: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    color: palette.goldPale,
  },
  closeBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  closeText: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    color: palette.textMid,
  },
});
