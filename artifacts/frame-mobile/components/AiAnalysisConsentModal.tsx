import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AiConsentStatus } from "@/lib/aiConsent";

export function AiConsentModal({
  visible,
  status,
  busy,
  onAccept,
  onDecline,
  onPrivacy,
}: {
  visible: boolean;
  status: AiConsentStatus | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onPrivacy: () => void;
}) {
  const disclosure = status?.disclosure;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={busy ? undefined : onDecline}
    >
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <Text style={s.kicker}>YOUR DATA · YOUR CHOICE</Text>
        <Text style={s.title}>AI COACHING PERMISSION</Text>
        <Text style={s.body}>
          FRAME uses Anthropic (Claude) and OpenAI services for AI coaching. The service may receive
          the exact categories listed below to provide coaching and analysis. Nothing is sent to either
          Anthropic/Claude or OpenAI before you agree.
        </Text>

        <Text style={s.heading}>WHAT MAY BE SENT</Text>
        {(disclosure?.sharedData ?? []).map((item) => (
          <View key={item} style={s.row}><Text style={s.dot}>•</Text><Text style={s.item}>{item}</Text></View>
        ))}

        <Text style={s.heading}>WHAT IS NOT SENT</Text>
        {(disclosure?.notShared ?? []).map((item) => (
          <View key={item} style={s.row}><Text style={s.dot}>•</Text><Text style={s.item}>{item}</Text></View>
        ))}

        {disclosure?.purpose ? <Text style={s.purpose}>{disclosure.purpose}</Text> : null}
        <Text style={s.note}>
          You can decline and keep using non-AI features in FRAME. You can withdraw permission from
          Profile at any time.
        </Text>
        <Pressable onPress={onPrivacy} accessibilityRole="link">
          <Text style={s.link}>READ THE PRIVACY POLICY</Text>
        </Pressable>
        <Pressable style={[s.accept, busy && s.disabled]} onPress={onAccept} disabled={busy}>
          {busy ? <ActivityIndicator color="#050505" /> : <Text style={s.acceptText}>AGREE & CONTINUE</Text>}
        </Pressable>
        <Pressable style={s.decline} onPress={onDecline} disabled={busy}>
          <Text style={s.declineText}>NOT NOW</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// Kept as an alias so the existing analysis integration can adopt the
// generalized disclosure without changing its request lifecycle.
export const AiAnalysisConsentModal = AiConsentModal;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  kicker: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: "#8A6A2F", marginBottom: 10 },
  title: { fontFamily: "Outfit_600SemiBold", fontSize: 28, color: "#f2f2f2", marginBottom: 20 },
  body: { fontFamily: "Outfit", fontSize: 15, lineHeight: 23, color: "#c8c8c8" },
  heading: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "#aaa", marginTop: 24, marginBottom: 8 },
  row: { flexDirection: "row", gap: 9, marginBottom: 8 },
  dot: { color: "#8A6A2F", fontSize: 16, lineHeight: 21 },
  item: { flex: 1, fontFamily: "Outfit", fontSize: 14, lineHeight: 21, color: "#bbb" },
  purpose: { fontFamily: "Outfit", fontSize: 13, lineHeight: 20, color: "#aaa", marginTop: 16 },
  note: { fontFamily: "Outfit", fontSize: 13, lineHeight: 20, color: "#888", marginTop: 18 },
  link: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 1.5, color: "#b99250", marginVertical: 24 },
  accept: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#b99250" },
  acceptText: { fontFamily: "SpaceMono", fontSize: 11, letterSpacing: 2, color: "#050505" },
  decline: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  declineText: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "#777" },
  disabled: { opacity: 0.5 },
});