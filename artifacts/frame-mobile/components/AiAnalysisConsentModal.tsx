import React, { useState, useEffect } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { formatProviderList, type AiConsentDisclosure } from "@workspace/ai-consent";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { Button, Display, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { FrameLogo } from "@/components/FrameLogo";

/**
 * AI data consent. An overlay panel (radius 20, solid raised surface) over a dark
 * scrim; the same panel is used for the optional prompt and the mandatory gate.
 */
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

  const toSentenceCase = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  const items: { icon: React.ComponentProps<typeof Feather>["name"]; title: string; body: React.ReactNode }[] = disclosure
    ? [
        {
          icon: "video",
          title: "What data is sent?",
          body: (
            <>
              {disclosure.sharedData.map((item) => (
                <View key={item} style={s.bulletRow}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={s.cardBody}>{toSentenceCase(item)}</Text>
                </View>
              ))}
            </>
          ),
        },
        { icon: "cloud", title: "Who receives it?", body: <Text style={s.cardBody}>{disclosure.use}</Text> },
        { icon: "bar-chart-2", title: "Why is it sent?", body: <Text style={s.cardBody}>{toSentenceCase(disclosure.purpose)}.</Text> },
        {
          icon: "lock",
          title: "Your control",
          body: (
            <>
              {disclosure.notShared.map((item) => (
                <View key={item} style={s.bulletRow}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={s.cardBody}>Not sent: {item}</Text>
                </View>
              ))}
              <Text style={[s.cardBody, s.controlNote]}>
                You can withdraw AI permission from Profile. Withdrawal pauses authenticated FRAME use and future AI
                requests until you accept the current disclosure again. You can also permanently delete your account.
              </Text>
            </>
          ),
        },
      ]
    : [];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={busy || mandatory ? () => {} : onDecline}
    >
      <View style={[s.scrim, { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={s.panel} accessibilityViewIsModal>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.header}>
              <FrameLogo height={14} />
            </View>

            <Display size="title" style={s.title}>
              AI data and privacy
            </Display>

            <Text style={s.intro}>
              {disclosure
                ? `FRAME uses ${formatProviderList(disclosure.providers)} ${disclosure.purpose}. Before any of the data below can be sent, we need your permission.`
                : "Loading the current AI data disclosure…"}
            </Text>

            {!disclosure ? (
              <View style={s.loadingContainer} accessibilityLabel="Loading disclosure">
                <ActivityIndicator color={palette.textMid} />
              </View>
            ) : (
              <View style={s.list}>
                {items.map((it, i) => (
                  <View key={it.title} style={[s.cardRow, i > 0 && s.rule]}>
                    <View style={s.cardIcon}>
                      <Feather name={it.icon} size={18} color={palette.textMid} />
                    </View>
                    <View style={s.cardContent}>
                      <Text style={s.cardTitle}>{it.title}</Text>
                      {it.body}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={s.links}>
              <Pressable style={s.linkRow} onPress={onPrivacy} accessibilityRole="link" accessibilityLabel="Read our Privacy Policy">
                <Feather name="file-text" size={18} color={palette.textMid} />
                <Text style={s.linkText}>Read our Privacy Policy</Text>
                <Feather name="chevron-right" size={18} color={palette.textLow} />
              </Pressable>
              {(mandatory || signup) && onTerms && (
                <Pressable style={[s.linkRow, s.rule]} onPress={onTerms} accessibilityRole="link" accessibilityLabel="Read our Terms of Service">
                  <Feather name="file-text" size={18} color={palette.textMid} />
                  <Text style={s.linkText}>Read our Terms of Service</Text>
                  <Feather name="chevron-right" size={18} color={palette.textLow} />
                </Pressable>
              )}
            </View>

            {!mandatory && onDecline ? (
              <Button
                title={signup ? "Go back" : "Not now"}
                variant="secondary"
                onPress={onDecline}
                disabled={busy}
                style={s.secondBtn}
              />
            ) : null}

            {mandatory && (
              <View style={s.mandatoryActions}>
                {onSignOut && <Button title="Sign out" variant="secondary" onPress={onSignOut} disabled={busy} />}
                {onDeleteAccount && <Button title="Delete account" variant="danger" onPress={onDeleteAccount} disabled={busy} />}
              </View>
            )}
          </ScrollView>
          {/* Pinned so the agree checkbox and button are always on screen, not a screen and a half down. */}
          <View style={s.footer}>
            <Pressable
              style={s.checkboxRow}
              onPress={() => {
                haptic.select();
                setChecked(!checked);
              }}
              disabled={!disclosure || busy}
              accessibilityRole="checkbox"
              accessibilityLabel="I understand and agree to the AI data sharing described above"
              accessibilityHint="Required before you can continue"
              accessibilityState={{ checked, disabled: !disclosure || busy }}
            >
              <View style={[s.checkbox, checked && s.checkboxChecked]}>
                {checked && <Feather name="check" size={16} color={palette.onGold} />}
              </View>
              <Text style={s.checkboxLabel}>
                I understand and agree to the sending of my data to{" "}
                {disclosure ? formatProviderList(disclosure.providers) : "the listed providers"} for the purposes described
                above.
              </Text>
            </Pressable>

            <Button
              title="Agree and continue"
              accessibilityLabel="Agree and continue"
              onPress={handleAccept}
              disabled={!canAccept}
              loading={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const AiAnalysisConsentModal = AiConsentModal;

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: palette.scrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    // web: blur on the scrim only (overlay is the one place blur is allowed)
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(8px)" } as object) : null),
  },
  panel: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "100%",
    flexShrink: 1,
    backgroundColor: palette.raised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    overflow: "hidden",
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24, paddingBottom: 24 },

  header: { alignItems: "center", marginBottom: 20 },
  logo: { width: 104, height: 24 },

  title: { textAlign: "center", marginBottom: 12 },
  intro: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textMid,
    textAlign: "center",
    marginBottom: 20,
  },

  loadingContainer: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },

  list: {
    marginBottom: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  cardRow: { flexDirection: "row", gap: 14, padding: 16 },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi, marginBottom: 4 },
  cardBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: palette.textMid, flexShrink: 1 },
  bulletRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  bullet: { color: palette.textLow, fontSize: 14, lineHeight: 21 },
  controlNote: { marginTop: 8 },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    minHeight: MIN_TAP,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: palette.gold, borderColor: palette.gold },
  checkboxLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: palette.textHi },

  links: { marginBottom: 20 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: MIN_TAP + 4 },
  linkText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: palette.textHi },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderStrong,
    backgroundColor: palette.raised,
  },
  secondBtn: { marginTop: 0 },
  mandatoryActions: { gap: 10, marginTop: 10 },
});
