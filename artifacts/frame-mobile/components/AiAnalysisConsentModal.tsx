import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { formatProviderList } from "@workspace/ai-consent";
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
  const [checked, setChecked] = useState(false);
  const disclosure = status?.disclosure;
  const insets = useSafeAreaInsets();

  // Reset checked state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setChecked(false);
    }
  }, [visible]);

  const canAccept = checked && Boolean(disclosure) && !busy;

  const handleAccept = () => {
    if (canAccept) {
      onAccept();
    }
  };

  const toSentenceCase = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={mandatory ? "fullScreen" : "pageSheet"}
      onRequestClose={busy || mandatory ? () => {} : onDecline}
    >
      <View style={s.root}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[
            s.content,
            { paddingBottom: Math.max(insets.bottom + 24, 48) },
            mandatory && { paddingTop: Math.max(insets.top + 24, 64) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <Image
              source={require("@/assets/images/frame-wordmark.png")}
              style={s.logo}
              contentFit="contain"
              accessibilityLabel="FRAME"
            />
            <Text style={s.tagline}>TRAIN SMARTER. FIGHT FURTHER.</Text>
          </View>

          <Text style={s.title}>AI Data & Privacy</Text>

          <Text style={s.intro}>
            {disclosure
              ? `FRAME uses ${formatProviderList(disclosure.providers)} ${disclosure.purpose}. Before any of the data below can be sent, we need your permission.`
              : "Loading the current AI data disclosure…"}
          </Text>

          {!disclosure ? (
            <View style={s.loadingContainer}>
              <ActivityIndicator color="#2563EB" size="large" />
            </View>
          ) : (
            <View style={s.cards}>
              <View style={s.card}>
                <Feather name="video" size={24} color="#D1D5DB" style={s.cardIcon} />
                <View style={s.cardContent}>
                  <Text style={s.cardTitle}>What data is sent?</Text>
                  {disclosure.sharedData.map((item) => (
                    <View key={item} style={s.bulletRow}>
                      <Text style={s.bullet}>•</Text>
                      <Text style={s.cardBody}>{toSentenceCase(item)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={s.card}>
                <Feather name="cloud" size={24} color="#D1D5DB" style={s.cardIcon} />
                <View style={s.cardContent}>
                  <Text style={s.cardTitle}>Who receives it?</Text>
                  <Text style={s.cardBody}>{disclosure.use}</Text>
                </View>
              </View>

              <View style={s.card}>
                <Feather name="bar-chart-2" size={24} color="#D1D5DB" style={s.cardIcon} />
                <View style={s.cardContent}>
                  <Text style={s.cardTitle}>Why is it sent?</Text>
                  <Text style={s.cardBody}>
                    {toSentenceCase(disclosure.purpose)}.
                  </Text>
                </View>
              </View>

              <View style={s.card}>
                <Feather name="lock" size={24} color="#D1D5DB" style={s.cardIcon} />
                <View style={s.cardContent}>
                  <Text style={s.cardTitle}>Your control</Text>
                  {disclosure.notShared.map((item) => (
                    <View key={item} style={s.bulletRow}>
                      <Text style={s.bullet}>•</Text>
                      <Text style={s.cardBody}>Not sent: {item}</Text>
                    </View>
                  ))}
                  <Text style={[s.cardBody, s.controlNote]}>
                    You can withdraw permission in Profile or permanently delete
                    your account. Withdrawing permission locks FRAME until you
                    accept again.
                  </Text>
                </View>
              </View>
            </View>
          )}

          <Pressable
            style={s.checkboxRow}
            onPress={() => setChecked(!checked)}
            disabled={!disclosure || busy}
            accessibilityRole="checkbox"
            accessibilityLabel="I understand and agree to the AI data sharing described above"
            accessibilityHint="Required before you can continue"
            accessibilityState={{ checked, disabled: !disclosure || busy }}
          >
            <View style={[s.checkbox, checked && s.checkboxChecked]}>
              {checked && <Feather name="check" size={16} color="#FFFFFF" />}
            </View>
            <Text style={s.checkboxLabel}>
              I understand and agree to the sending of my data to{" "}
              {disclosure ? formatProviderList(disclosure.providers) : "the listed providers"}{" "}
              for the purposes described above.
            </Text>
          </Pressable>

          <View style={s.links}>
            <Pressable
              style={s.linkRow}
              onPress={onPrivacy}
              accessibilityRole="link"
              accessibilityLabel="Read our Privacy Policy"
            >
              <Feather name="file-text" size={20} color="#9CA3AF" />
              <Text style={s.linkText}>Read our Privacy Policy</Text>
              <Feather name="chevron-right" size={20} color="#6B7280" />
            </Pressable>
            {mandatory && onTerms && (
              <Pressable
                style={s.linkRow}
                onPress={onTerms}
                accessibilityRole="link"
                accessibilityLabel="Read our Terms of Service"
              >
                <Feather name="file-text" size={20} color="#9CA3AF" />
                <Text style={s.linkText}>Read our Terms of Service</Text>
                <Feather name="chevron-right" size={20} color="#6B7280" />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[s.acceptButton, !canAccept && s.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!canAccept}
            accessibilityRole="button"
            accessibilityLabel="Agree and continue"
            accessibilityHint={
              checked
                ? "Accepts the current AI disclosure and continues into FRAME"
                : "Select the acknowledgement checkbox first"
            }
            accessibilityState={{ disabled: !canAccept, busy }}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.acceptButtonText}>Agree & Continue</Text>
            )}
          </Pressable>

          {!mandatory && onDecline ? (
            <Pressable style={s.declineButton} onPress={onDecline} disabled={busy}>
              <Text style={s.declineButtonText}>Not Now</Text>
            </Pressable>
          ) : null}

          {mandatory && (
            <View style={s.mandatoryActions}>
              {onSignOut && (
                <Pressable style={s.ghostButton} onPress={onSignOut} disabled={busy}>
                  <Text style={s.ghostButtonText}>Sign Out</Text>
                </Pressable>
              )}
              {onDeleteAccount && (
                <Pressable style={s.ghostButton} onPress={onDeleteAccount} disabled={busy}>
                  <Text style={s.deleteButtonText}>Delete Account</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export const AiAnalysisConsentModal = AiConsentModal;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  scroll: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 48 },

  header: { alignItems: "center", marginBottom: 32 },
  logo: { width: 120, height: 28, marginBottom: 8 },
  tagline: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 2, color: "#9CA3AF" },

  title: { fontFamily: "Outfit_600SemiBold", fontSize: 28, color: "#FFFFFF", textAlign: "center", marginBottom: 16 },
  intro: { fontFamily: "Outfit", fontSize: 15, lineHeight: 22, color: "#D1D5DB", textAlign: "center", marginBottom: 32 },

  loadingContainer: { paddingVertical: 48, alignItems: "center", justifyContent: "center" },

  cards: { gap: 12, marginBottom: 32 },
  card: {
    flexDirection: "row",
    backgroundColor: "#111111",
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  cardIcon: { marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: "Outfit_500Medium", fontSize: 16, color: "#FFFFFF", marginBottom: 4 },
  cardBody: { fontFamily: "Outfit", fontSize: 14, lineHeight: 20, color: "#9CA3AF" },
  bulletRow: { flexDirection: "row", gap: 7, marginTop: 4 },
  bullet: { color: "#6B7280", fontSize: 14, lineHeight: 20 },
  controlNote: { marginTop: 8 },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#4B5563",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    lineHeight: 20,
    color: "#E5E7EB",
  },

  links: { gap: 16, marginBottom: 32 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  linkText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#D1D5DB",
  },

  acceptButton: {
    minHeight: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    marginBottom: 16,
  },
  acceptButtonDisabled: { opacity: 0.5 },
  acceptButtonText: { fontFamily: "Outfit_600SemiBold", fontSize: 16, color: "#FFFFFF" },

  declineButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  declineButtonText: { fontFamily: "Outfit_500Medium", fontSize: 15, color: "#9CA3AF" },

  mandatoryActions: { gap: 8, marginTop: 8 },
  ghostButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostButtonText: { fontFamily: "Outfit_500Medium", fontSize: 14, color: "#9CA3AF" },
  deleteButtonText: { fontFamily: "Outfit_500Medium", fontSize: 14, color: "#EF4444" },
});
