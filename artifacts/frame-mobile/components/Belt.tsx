import React from "react";
import { StyleSheet, Text, View } from "react-native";

// Belt psychology — ported verbatim from @workspace/archetypes (the web's
// source of truth). FRAME spans all combat sports, so rank is the universal
// coloured progression; the athlete's real held belt maps into it, higher
// belts stay dormant to create aspiration without fabricating progress.
const BELT_PSYCHOLOGY = [
  {
    key: "white",
    label: "White belt",
    state: "Chaotic movement",
    meaning:
      "Reactions fire faster than thought. Energy leaks everywhere — pure survival.",
  },
  {
    key: "blue",
    label: "Blue belt",
    state: "Beginning awareness",
    meaning:
      "You start to see the pattern mid-exchange. Composure flickers on, then off.",
  },
  {
    key: "purple",
    label: "Purple belt",
    state: "Adaptive under pressure",
    meaning:
      "You adjust while it's happening. Pressure stops dictating and starts informing.",
  },
  {
    key: "brown",
    label: "Brown belt",
    state: "Composed under fatigue",
    meaning:
      "The frame holds when the tank empties. Tired no longer means scattered.",
  },
  {
    key: "black",
    label: "Black belt",
    state: "Stable under fragmentation",
    meaning:
      "When everything breaks, you don't. Structure survives chaos — and imposes it.",
  },
] as const;

// The full aspirational ladder (white → black). Only the five keys above are
// ever "held"; the intermediate rungs render as dormant aspiration.
const LADDER: { key: string; label: string; cloth: string }[] = [
  { key: "white", label: "White", cloth: "#ece7d8" },
  { key: "blue", label: "Blue", cloth: "#1f5fc4" },
  { key: "purple", label: "Purple", cloth: "#6b32c9" },
  { key: "brown", label: "Brown", cloth: "#5a3a22" },
  { key: "black", label: "Black", cloth: "#1d1d1d" },
];

function beltKeyOf(level: string): string | null {
  const l = level.toLowerCase();
  for (const b of BELT_PSYCHOLOGY) {
    if (l.startsWith(b.key)) return b.key;
  }
  return null;
}

// A horizontal martial-arts belt: two crossing bands in the rank colour with a
// centre knot and a gold edge line. Simplified from the web's SVG-ish version
// but reads the same — "white belt in a luxury system".
function RealisticBelt({ cloth }: { cloth: string }) {
  return (
    <View style={beltStyles.beltWrap}>
      <View style={[beltStyles.band, { backgroundColor: cloth }]} />
      <View style={[beltStyles.goldEdge, { top: 0 }]} />
      <View style={[beltStyles.goldEdge, { bottom: 0 }]} />
      <View style={[beltStyles.knot, { backgroundColor: cloth }]} />
    </View>
  );
}

function BeltLadder({ currentIndex }: { currentIndex: number }) {
  return (
    <View style={beltStyles.ladder}>
      {LADDER.map((rung, i) => {
        const earned = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <View key={rung.key} style={beltStyles.ladderCol}>
            <View
              style={[
                beltStyles.node,
                {
                  backgroundColor: earned ? rung.cloth : "transparent",
                  borderColor: earned
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(255,255,255,0.12)",
                  opacity: earned ? 1 : 0.45,
                },
                isCurrent && beltStyles.nodeCurrent,
              ]}
            />
            <Text
              style={[
                beltStyles.rungLabel,
                { color: isCurrent ? "#C9883A" : earned ? "#999" : "#555" },
              ]}
            >
              {rung.label.slice(0, 3).toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function Belt({ level, showMeaning = true }: { level: string; showMeaning?: boolean }) {
  const key = beltKeyOf(level);
  const ladderIndex = key ? LADDER.findIndex((r) => r.key === key) : -1;
  const meaning = key
    ? BELT_PSYCHOLOGY.find((b) => b.key === key) ?? null
    : null;

  if (ladderIndex < 0) {
    return (
      <View style={beltStyles.unranked}>
        <Text style={beltStyles.unrankedText}>UNRANKED / OTHER</Text>
      </View>
    );
  }

  const rung = LADDER[ladderIndex];
  const next = ladderIndex < LADDER.length - 1 ? LADDER[ladderIndex + 1] : null;

  return (
    <View style={{ gap: 16 }}>
      <RealisticBelt cloth={rung.cloth} />

      <View style={beltStyles.headRow}>
        <Text style={beltStyles.rankLabel}>{rung.label.toUpperCase()} BELT</Text>
        {next ? (
          <Text style={beltStyles.nextLabel}>NEXT · {next.label.toUpperCase()}</Text>
        ) : (
          <Text style={beltStyles.apexLabel}>APEX</Text>
        )}
      </View>

      <BeltLadder currentIndex={ladderIndex} />

      {showMeaning && meaning && (
        <View style={beltStyles.meaning}>
          <Text style={beltStyles.meaningState}>{meaning.state.toUpperCase()}</Text>
          <Text style={beltStyles.meaningText}>{meaning.meaning}</Text>
        </View>
      )}
    </View>
  );
}

const beltStyles = StyleSheet.create({
  beltWrap: {
    height: 56,
    width: "100%",
    justifyContent: "center",
  },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 14,
    height: 28,
    borderRadius: 3,
  },
  goldEdge: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    marginTop: 14,
    backgroundColor: "rgba(201,136,58,0.35)",
  },
  knot: {
    position: "absolute",
    left: "50%",
    marginLeft: -23,
    top: 8,
    width: 46,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.25)",
  },
  ladder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  ladderCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  node: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
  },
  nodeCurrent: {
    shadowColor: "#C9883A",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  rungLabel: {
    fontFamily: "SpaceMono",
    fontSize: 7,
    letterSpacing: 1,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  rankLabel: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 4,
    color: "#e0e0e0",
  },
  nextLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#777",
  },
  apexLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#C9883A",
  },
  meaning: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(201,136,58,0.4)",
    paddingLeft: 12,
    paddingTop: 2,
  },
  meaningState: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#C9883A",
  },
  meaningText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#888",
    lineHeight: 18,
    marginTop: 4,
  },
  unranked: {
    height: 56,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  unrankedText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#666",
  },
});
