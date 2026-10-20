import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { OrbGL } from "@/components/OrbGL";
import { useAuth } from "@/context/AuthContext";
import { useToday } from "@/hooks/useToday";
import { DisclosureNotice } from "@/components/TodayCards";
import { apiGet } from "@/lib/api";
import { formatDay } from "@/lib/localDay";
import { stateDateLine, stateHeadline } from "@/lib/today";
import {
  readinessModifier,
  applyReadinessModifier,
  type ChatMessageLike,
} from "@/lib/readinessModifier";

type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

// One coaching cue per interpretive state. Deterministic — keyed to the same
// honestly-derived state as the orb label, never generated, never a metric.
const STATE_CUE: Record<OrbState, string> = {
  Dormant: "Step in. The frame reads what you feed it.",
  Stable: "Narrow the decision tree.",
  Loaded: "Trade speed for position.",
  Recovering: "Protect the rebuild.",
  Tight: "Commit earlier than comfort wants.",
  Volatile: "Anchor the breath before the exchange.",
  Composed: "Hold the standard. Add pressure, not pace.",
  Overextended: "Cut volume. Keep structure.",
};

export default function StateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();

  // The server is the one authority on the athlete's State for their local day. An older
  // read is never presented as today's.
  const todayQuery = useToday();
  const today = todayQuery.data ?? null;
  const stateInfo = today?.state ?? null;
  const current = !!stateInfo?.current && !!stateInfo.name;
  // The orb only takes a state when it is today's read; otherwise it rests at Dormant.
  const state: OrbState = current && stateInfo?.name ? stateInfo.name : "Dormant";
  const loading = todayQuery.isLoading;
  const failed = todayQuery.isError && !todayQuery.data;
  const dateLine = stateInfo ? stateDateLine(stateInfo, (d) => formatDay(d))?.toUpperCase() ?? null : null;

  // Readiness comes from today's check-in only (never an older one passed off as today's).
  const checkinScore = today?.readiness.today?.score ?? null;

  // Recent chat drives a small ±10 modifier on top of the base readiness. It
  // reuses the same conversation the chat tab reads, so no new data flow.
  const conversationQuery = useQuery<ChatMessageLike[]>({
    queryKey: ["conversation-active"],
    queryFn: () =>
      apiGet<{ messages: ChatMessageLike[] }>("/conversation/active").then((r) =>
        Array.isArray(r?.messages) ? r.messages : [],
      ),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
  const chatModifier = useMemo(
    () => readinessModifier(conversationQuery.data ?? []),
    [conversationQuery.data],
  );

  const readiness = applyReadinessModifier(checkinScore, chatModifier);
  // No check-in today: show the last real one, labelled as old, instead of an empty prompt.
  const lastRead = readiness == null ? (today?.readiness.latest ?? null) : null;
  const lastReadAge = lastRead
    ? lastRead.daysAgo <= 0 ? "EARLIER" : lastRead.daysAgo === 1 ? "YESTERDAY" : `${lastRead.daysAgo} DAYS AGO`
    : null;
  // When the disclosure notice is up it already says why there is no read, so the cue stays quiet.
  const showDisclosure = !!today && today.disclosure.code !== "none";

  // Doorway label mirrors the prototype: "Continue" only when a real prior
  // session exists, else "Enter". Reuses the conversation query already fetched
  // for the readiness modifier.
  const hasSession = (conversationQuery.data?.length ?? 0) > 0;

  // Size the orb to fit the available vertical space rather than just the
  // screen width. The center view holds the orb + ~190px of text/gaps below it;
  // measuring its actual height prevents the footer from overlapping on short
  // devices (iPhone SE) or when the state text wraps to a second line.
  const { width } = useWindowDimensions();
  const [centerHeight, setCenterHeight] = useState(0);
  // The disclosure notice (no read yet) and the dated line sit under the cue, so give the orb less room when they show.
  const TEXT_AND_GAPS = 160 + (showDisclosure ? 175 : 0) + (dateLine ? 24 : 0) + (failed ? 60 : 0); // stateCaption + stateLabel + stateCue + gaps (readinessRow now lives outside center)
  const orbSize =
    centerHeight > 0
      ? Math.round(Math.max(80, Math.min(width, centerHeight - TEXT_AND_GAPS, 400)))
      : Math.round(Math.min(width * 0.75, 300)); // safe fallback before first layout

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image
            source={require("../../assets/images/frame-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <View>
            <Image
              source={require("../../assets/images/frame-wordmark.png")}
              style={styles.wordmarkImg}
              resizeMode="contain"
            />
            <Text style={styles.subline}>STATE · CALIBRATION SYSTEM</Text>
          </View>
        </View>
      </View>

      {/* Orb */}
      {/* A scroll view, not a plain View: on a short screen with the notice up, the content scrolls
          instead of overlapping the header and the readiness row. */}
      <ScrollView
        style={styles.centerScroll}
        contentContainerStyle={styles.center}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setCenterHeight(e.nativeEvent.layout.height)}
      >
        <OrbGL state={state} size={orbSize} />

        <Text style={styles.stateCaption}>STATE</Text>
        {failed ? (
          <>
            <Text style={[styles.stateLabel, { color: "#666" }]}>UNAVAILABLE</Text>
            <Text style={styles.stateCue}>COULDN'T LOAD YOUR STATE. CHECK YOUR CONNECTION.</Text>
            <Pressable onPress={() => void todayQuery.refetch()} hitSlop={8} accessibilityRole="button">
              <View style={styles.readinessCta}>
                <Text style={styles.readinessCtaText}>TRY AGAIN</Text>
                <Feather name="chevron-right" size={12} color="#8A6A2F" />
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.stateLabel, !current && { color: "#666" }]} numberOfLines={1} adjustsFontSizeToFit>
              {(loading || !stateInfo ? (loading ? "READING…" : "NO READ YET") : stateHeadline(stateInfo)).toUpperCase()}
            </Text>
            {dateLine ? <Text style={styles.stateDate}>{dateLine}</Text> : null}
            {current || !showDisclosure ? (
              <Text style={styles.stateCue}>
                {current ? STATE_CUE[state] : "FRAME HOLDS NO READ FOR TODAY. CHECK IN OR TELL YOUR COACH HOW TRAINING WENT."}
              </Text>
            ) : null}
            {showDisclosure && today ? (
              <View style={styles.noticeWrap}>
                <DisclosureNotice
                  centered
                  disclosure={today.disclosure}
                  onCheckIn={() => router.push({ pathname: "/(tabs)/home", params: { checkin: "1", n: String(Date.now()) } })}
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Fight readiness — sits between the orb block and the button so it
          reads as visually centred in the gap rather than glued to the text */}
      <View style={styles.readinessMiddle}>
        <Pressable
          style={styles.readinessRow}
          hitSlop={8}
          onPress={() =>
            router.push(
              "/(tabs)/home",
            )
          }
          accessibilityLabel={
            readiness != null ? "View readiness detail" : "Open home"
          }
        >
          <Text style={styles.readinessLabel}>FIGHT READINESS</Text>
          {readiness != null ? (
            <Text style={styles.readinessValue}>
              {readiness}
              <Text style={styles.readinessUnit}> / 100 · TODAY</Text>
            </Text>
          ) : lastRead && lastReadAge ? (
            <Text style={[styles.readinessValue, { color: "#666" }]}>
              {lastRead.score}
              <Text style={styles.readinessUnit}> / 100 · {lastReadAge}</Text>
            </Text>
          ) : null}
          {readiness == null ? (
            <View style={styles.readinessCta}>
              <Text style={styles.readinessCtaText}>OPEN TRAINING DASHBOARD</Text>
              <Feather name="chevron-right" size={12} color="#8A6A2F" />
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Enter CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}>
        <Pressable
          style={({ pressed }) => [styles.enterBtn, pressed && styles.enterPressed]}
          onPress={() => router.push("/(tabs)/chat")}
        >
          <Text style={styles.enterText}>{hasSession ? "CONTINUE" : "ENTER"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 34,
    height: 34,
    opacity: 0.9,
  },
  wordmarkImg: {
    width: 92,
    height: 26,
    tintColor: "#e0e0e0",
  },
  subline: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 4,
    color: "#555",
    marginTop: 4,
  },
  centerScroll: { flex: 1 },
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  stateCaption: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 6,
    color: "#666",
    marginTop: 8,
  },
  stateLabel: {
    fontFamily: "SpaceMono",
    fontSize: 22,
    letterSpacing: 8,
    color: "#8A6A2F",
  },
  stateDate: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#555",
  },
  stateCue: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 16,
  },
  readinessMiddle: {
    alignItems: "center",
    paddingVertical: 20,
  },
  readinessRow: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 24,
  },
  noticeWrap: { alignSelf: "stretch", paddingHorizontal: 32 },
  readinessLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 4,
    color: "#555",
  },
  readinessValue: {
    fontFamily: "SpaceMono",
    fontSize: 16,
    color: "#8A6A2F",
  },
  readinessUnit: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
  },
  readinessCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readinessCtaText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  footer: {
    alignItems: "center",
    paddingBottom: 32,
  },
  enterBtn: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e0e0e0",
    paddingHorizontal: 48,
    paddingVertical: 14,
  },
  enterPressed: {
    borderColor: "#8A6A2F",
  },
  enterText: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 6,
    color: "#e0e0e0",
  },
});
