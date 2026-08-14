import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient as SvgRadialGradient, Rect, Stop } from "react-native-svg";

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
const LADDER: { key: string; label: string; cloth: string; ink: string }[] = [
  { key: "white", label: "White", cloth: "#ece7d8", ink: "#15130d" },
  { key: "blue", label: "Blue", cloth: "#1f5fc4", ink: "#04101f" },
  { key: "purple", label: "Purple", cloth: "#6b32c9", ink: "#0c0418" },
  { key: "brown", label: "Brown", cloth: "#5a3a22", ink: "#160d06" },
  { key: "black", label: "Black", cloth: "#1d1d1d", ink: "#000000" },
];

function beltKeyOf(level: string): string | null {
  const l = level.toLowerCase();
  for (const b of BELT_PSYCHOLOGY) {
    if (l.startsWith(b.key)) return b.key;
  }
  return null;
}

// A horizontal martial-arts belt matching the website (coach/src/components/
// belt.tsx): two shaded bands (light top → dark bottom) with gold edge
// stitching, a black BJJ rank-tip bar near the right end, a centre knot with
// two hanging tails, gold L-corner brackets and a soft golden halo. The cloth
// keeps the rank colour; the gold only frames it — "belt in a luxury system".
const GOLD = "hsla(40,75%,58%,1)";

// Vertical cloth shade: bright top highlight → solid cloth → dark bottom.
function bandShade(cloth: string): [string, string, string, string] {
  return ["rgba(255,255,255,0.14)", cloth, cloth, "rgba(0,0,0,0.28)"];
}
const BAND_LOCS: [number, number, number, number] = [0, 0.22, 0.64, 1];

function Band({
  side,
  cloth,
  stitch,
}: {
  side: "left" | "right";
  cloth: string;
  stitch: string;
}) {
  return (
    <View
      style={[
        beltStyles.band,
        side === "left" ? beltStyles.bandLeft : beltStyles.bandRight,
      ]}
    >
      <LinearGradient
        colors={bandShade(cloth)}
        locations={BAND_LOCS}
        style={StyleSheet.absoluteFill}
      />
      {/* gold top edge line */}
      <View style={beltStyles.goldEdgeTop} />
      {/* dark edge stitching */}
      <View style={[beltStyles.stitch, { top: 4, backgroundColor: stitch }]} />
      <View style={[beltStyles.stitch, { bottom: 4, backgroundColor: stitch }]} />
    </View>
  );
}

function RealisticBelt({ cloth, ink, label }: { cloth: string; ink: string; label: string }) {
  const isDarkCloth = cloth === "#1d1d1d";
  const stitch = isDarkCloth ? "rgba(212,175,90,0.55)" : "rgba(0,0,0,0.14)";

  return (
    <View style={beltStyles.beltWrap} accessibilityLabel={`${label} belt`}>
      {/* golden halo */}
      <View style={beltStyles.halo} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <SvgRadialGradient id="beltHalo" cx="50%" cy="50%" r="60%">
              <Stop offset="0%" stopColor="#d9a441" stopOpacity={0.16} />
              <Stop offset="100%" stopColor="#d9a441" stopOpacity={0} />
            </SvgRadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#beltHalo)" />
        </Svg>
      </View>

      {/* left + right bands */}
      <Band side="left" cloth={cloth} stitch={stitch} />
      <Band side="right" cloth={cloth} stitch={stitch} />

      {/* rank tip bar near right end (gold line + black tip, BJJ-style) */}
      <View style={beltStyles.tipGroup}>
        <View style={beltStyles.tipGold} />
        <View style={[beltStyles.tipBar, { backgroundColor: ink }]} />
      </View>

      {/* centre knot with two hanging tails */}
      <View style={beltStyles.knotWrap} pointerEvents="none">
        <View style={[beltStyles.tail, beltStyles.tail1]}>
          <LinearGradient colors={bandShade(cloth)} locations={BAND_LOCS} style={StyleSheet.absoluteFill} />
        </View>
        <View style={[beltStyles.tail, beltStyles.tail2]}>
          <LinearGradient colors={bandShade(cloth)} locations={BAND_LOCS} style={StyleSheet.absoluteFill} />
        </View>
        <View style={beltStyles.knotBlock}>
          <LinearGradient colors={bandShade(cloth)} locations={BAND_LOCS} style={StyleSheet.absoluteFill} />
          <View style={[beltStyles.knotStitch, { backgroundColor: stitch }]} />
        </View>
      </View>

      {/* gold L-corner brackets */}
      <View style={[beltStyles.corner, beltStyles.cornerTL]} pointerEvents="none" />
      <View style={[beltStyles.corner, beltStyles.cornerTR]} pointerEvents="none" />
      <View style={[beltStyles.corner, beltStyles.cornerBL]} pointerEvents="none" />
      <View style={[beltStyles.corner, beltStyles.cornerBR]} pointerEvents="none" />
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
      <RealisticBelt cloth={rung.cloth} ink={rung.ink} label={rung.label} />

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
    height: 68,
    width: "100%",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    left: -16,
    right: -16,
    top: -12,
    bottom: -12,
  },
  band: {
    position: "absolute",
    top: 14,
    height: 40,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  bandLeft: {
    left: 0,
    right: "50%",
    marginRight: 10,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
  bandRight: {
    right: 0,
    left: "50%",
    marginLeft: 10,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 1,
  },
  goldEdgeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: "hsla(40,75%,60%,0.35)",
  },
  stitch: {
    position: "absolute",
    left: 4,
    right: 4,
    height: 1,
  },
  tipGroup: {
    position: "absolute",
    top: 14,
    right: "14%",
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tipGold: {
    width: 3,
    height: 40,
    backgroundColor: "hsla(40,75%,58%,0.6)",
  },
  tipBar: {
    width: 26,
    height: 40,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  knotWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 46,
    height: 40,
    marginLeft: -23,
    marginTop: -20,
    zIndex: 20,
  },
  tail: {
    position: "absolute",
    width: 20,
    overflow: "hidden",
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 6 },
  },
  tail1: {
    left: 6,
    top: 18,
    height: 40,
    transform: [{ rotate: "8deg" }],
  },
  tail2: {
    left: 20,
    top: 18,
    height: 44,
    transform: [{ rotate: "-7deg" }],
  },
  knotBlock: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 46,
    height: 40,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.25)",
    zIndex: 2,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  knotStitch: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 19,
    height: 2,
  },
  corner: {
    position: "absolute",
    width: 6,
    height: 6,
    borderColor: "hsla(40,75%,58%,0.7)",
  },
  cornerTL: { left: 1, top: 1, borderTopWidth: 1, borderLeftWidth: 1 },
  cornerTR: { right: 1, top: 1, borderTopWidth: 1, borderRightWidth: 1 },
  cornerBL: { left: 1, bottom: 1, borderBottomWidth: 1, borderLeftWidth: 1 },
  cornerBR: { right: 1, bottom: 1, borderBottomWidth: 1, borderRightWidth: 1 },
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
