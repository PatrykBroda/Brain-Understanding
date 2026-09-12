import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AiConsentStatus } from "@/lib/aiConsent";

export function AiConsentModal({
  visible,
  status,
  busy,
  mandatory = false,
  onAccept,
  onDecline,
  onPrivacy,
  onTerms,
  onSignOut,
  onDeleteAccount,
}: {
  visible: boolean;
  status: AiConsentStatus | null;
  busy: boolean;
  mandatory?: boolean;
  onAccept: () => void;
  onDecline?: () => void;
  onPrivacy: () => void;
  onTerms?: () => void;
  onSignOut?: () => void;
  onDeleteAccount?: () => void;
}) {
  const disclosure = status?.disclosure;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={mandatory ? "fullScreen" : "pageSheet"}
      onRequestClose={busy || mandatory ? () => {} : onDecline}
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

        {!mandatory ? (
          <Text style={s.note}>
            You can withdraw permission from Profile at any time.
          </Text>
        ) : (
          <Text style={s.note}>
            FRAME requires this permission to function. You can withdraw permission from Profile at any time, but doing so will lock the app until you accept again.
          </Text>
        )}

        <View style={s.linksRow}>
          <Pressable onPress={onPrivacy} accessibilityRole="link">
            <Text style={s.link}>PRIVACY POLICY</Text>
          </Pressable>
          {mandatory && onTerms && (
            <Pressable onPress={onTerms} accessibilityRole="link">
              <Text style={s.link}>TERMS OF SERVICE</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={[s.accept, busy && s.disabled]} onPress={onAccept} disabled={busy}>
          {busy ? <ActivityIndicator color="#050505" /> : <Text style={s.acceptText}>AGREE & CONTINUE</Text>}
        </Pressable>

        {!mandatory && onDecline ? (
          <Pressable style={s.decline} onPress={onDecline} disabled={busy}>
            <Text style={s.declineText}>NOT NOW</Text>
          </Pressable>
        ) : null}

        {mandatory && (
          <View style={s.mandatoryActions}>
            {onSignOut && (
              <Pressable style={s.decline} onPress={onSignOut} disabled={busy}>
                <Text style={s.declineText}>SIGN OUT</Text>
              </Pressable>
            )}
            {onDeleteAccount && (
              <Pressable style={s.delete} onPress={onDeleteAccount} disabled={busy}>
                <Text style={s.deleteText}>DELETE ACCOUNT</Text>
              </Pressable>
            )}
          </View>
        )}
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
  linksRow: { flexDirection: "row", gap: 24, marginVertical: 24, flexWrap: "wrap" },
  link: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 1.5, color: "#b99250" },
  accept: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#b99250", marginBottom: 12 },
  acceptText: { fontFamily: "SpaceMono", fontSize: 11, letterSpacing: 2, color: "#050505" },
  decline: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  declineText: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "#777" },
  delete: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  deleteText: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "#bf4040" },
  disabled: { opacity: 0.5 },
  mandatoryActions: { marginTop: 8, gap: 4 },
});