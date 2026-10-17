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
import { formatProviderList, type AiConsentDisclosure } from "@workspace/ai-consent";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { Button, Display, Eyebrow, GlassCard, Screen } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";

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
  signup = false,
  disclosure: disclosureOverride,
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
  signup?: boolean;
  disclosure?: AiConsentDisclosure;
}) {
  const [checked, setChecked] = useState(false);
  const disclosure = disclosureOverride ?? status?.disclosure;
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
      <Screen>
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
            <Eyebrow>TRAIN SMARTER. FIGHT FURTHER.</Eyebrow>
          </View>

          <Display size="title" style={s.title}>
            AI Data & Privacy
          </Display>

          <Text style={s.intro}>
            {disclosure
              ? `FRAME uses ${formatProviderList(disclosure.providers)} ${disclosure.purpose}. Before any of the data below can be sent, we need your permission.`
              : "Loading the current AI data disclosure…"}
          </Text>

          {!disclosure ? (
            <View style={s.loadingContainer}>
              <ActivityIndicator color={palette.goldLight} size="large" />
            </View>
          ) : (
            <View style={s.cards}>
              <GlassCard radius={24} padding={18}>
                <View style={s.cardRow}>
                  <View style={s.cardIcon}>
                    <Feather name="video" size={18} color={palette.goldPale} />
                  </View>
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
              </GlassCard>

              <GlassCard radius={24} padding={18}>
                <View style={s.cardRow}>
                  <View style={s.cardIcon}>
                    <Feather name="cloud" size={18} color={palette.goldPale} />
                  </View>
                  <View style={s.cardContent}>
                    <Text style={s.cardTitle}>Who receives it?</Text>
                    <Text style={s.cardBody}>{disclosure.use}</Text>
                  </View>
                </View>
              </GlassCard>

              <GlassCard radius={24} padding={18}>
                <View style={s.cardRow}>
                  <View style={s.cardIcon}>
                    <Feather name="bar-chart-2" size={18} color={palette.goldPale} />
                  </View>
                  <View style={s.cardContent}>
                    <Text style={s.cardTitle}>Why is it sent?</Text>
                    <Text style={s.cardBody}>
                      {toSentenceCase(disclosure.purpose)}.
                    </Text>
                  </View>
                </View>
              </GlassCard>

              <GlassCard radius={24} padding={18}>
                <View style={s.cardRow}>
                  <View style={s.cardIcon}>
                    <Feather name="lock" size={18} color={palette.goldPale} />
                  </View>
                  <View style={s.cardContent}>
                    <Text style={s.cardTitle}>Your control</Text>
                    {disclosure.notShared.map((item) => (
                      <View key={item} style={s.bulletRow}>
                        <Text style={s.bullet}>•</Text>
                        <Text style={s.cardBody}>Not sent: {item}</Text>
                      </View>
                    ))}
                    <Text style={[s.cardBody, s.controlNote]}>
                      You can withdraw AI permission from Profile. Withdrawal pauses
                      authenticated FRAME use and future AI requests until you accept
                      the current disclosure again. You can also permanently delete
                      your account.
                    </Text>
                  </View>
                </View>
              </GlassCard>
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
              {checked && <Feather name="check" size={16} color="#050505" />}
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
              <Feather name="file-text" size={20} color={palette.goldLight} />
              <Text style={s.linkText}>Read our Privacy Policy</Text>
              <Feather name="chevron-right" size={20} color={palette.textLow} />
            </Pressable>
            {(mandatory || signup) && onTerms && (
              <Pressable
                style={s.linkRow}
                onPress={onTerms}
                accessibilityRole="link"
                accessibilityLabel="Read our Terms of Service"
              >
                <Feather name="file-text" size={20} color={palette.goldLight} />
                <Text style={s.linkText}>Read our Terms of Service</Text>
                <Feather name="chevron-right" size={20} color={palette.textLow} />
              </Pressable>
            )}
          </View>

          <Button
            title="Agree & Continue"
            accessibilityLabel="Agree and continue"
            onPress={handleAccept}
            disabled={!canAccept}
            loading={busy}
            style={{ marginBottom: 16 }}
          />

          {!mandatory && onDecline ? (
            <Pressable
              style={s.declineButton}
              onPress={onDecline}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={s.declineButtonText}>{signup ? "Go Back" : "Not Now"}</Text>
            </Pressable>
          ) : null}

          {mandatory && (
            <View style={s.mandatoryActions}>
              {onSignOut && (
                <Pressable
                  style={s.ghostButton}
                  onPress={onSignOut}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={s.ghostButtonText}>Sign Out</Text>
                </Pressable>
              )}
              {onDeleteAccount && (
                <Pressable
                  style={s.ghostButton}
                  onPress={onDeleteAccount}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={s.deleteButtonText}>Delete Account</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </Screen>
    </Modal>
  );
}

export const AiAnalysisConsentModal = AiConsentModal;

const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 48 },

  header: { alignItems: "center", marginBottom: 32, gap: 10 },
  logo: { width: 120, height: 28 },

  title: { textAlign: "center", marginBottom: 16 },
  intro: {
    fontFamily: fonts.text,
    fontSize: 15,
    lineHeight: 23,
    color: palette.textMid,
    textAlign: "center",
    marginBottom: 32,
  },

  loadingContainer: { paddingVertical: 48, alignItems: "center", justifyContent: "center" },

  cards: { gap: 14, marginBottom: 32 },
  cardRow: { flexDirection: "row", gap: 14 },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: fonts.textMedium, fontSize: 16, color: palette.textHi, marginBottom: 4 },
  cardBody: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: palette.textMid, flexShrink: 1 },
  bulletRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  bullet: { color: palette.goldLight, fontSize: 14, lineHeight: 21 },
  controlNote: { marginTop: 8 },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 28,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.glassEdgeHi,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.glass,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.goldLight,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 21,
    color: palette.text,
  },

  links: { gap: 4, marginBottom: 32 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  linkText: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 15,
    color: palette.text,
  },

  declineButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  declineButtonText: { fontFamily: fonts.textMedium, fontSize: 15, color: palette.textMid },

  mandatoryActions: { gap: 8, marginTop: 8 },
  ghostButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostButtonText: { fontFamily: fonts.textMedium, fontSize: 14, color: palette.textMid },
  deleteButtonText: { fontFamily: fonts.textMedium, fontSize: 14, color: palette.redLight },
});
