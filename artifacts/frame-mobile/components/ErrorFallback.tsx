import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Display, Body, GlassCard, Screen, IconButton } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const insets = useSafeAreaInsets();

  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error("Failed to restart app:", restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <Screen light={null}>
      <View style={styles.container}>
        {__DEV__ ? (
          <View style={[styles.topButton, { top: insets.top + 16 }]}>
            <IconButton icon="alert-circle" label="View error details" onPress={() => setIsModalVisible(true)} />
          </View>
        ) : null}

        <View style={styles.content}>
          <GlassCard tone="red" raised radius={radius.xl} padding={24} style={styles.card}>
            <View style={styles.cardStack} accessibilityRole="alert">
              <View style={styles.iconDisc}>
                <Feather name="alert-triangle" size={22} color={palette.redText} />
              </View>
              <Display size="title" style={styles.title}>
                Something went wrong
              </Display>
              <Body style={styles.message}>Please reload the app to continue. Your data is safe.</Body>
              <Button title="Try again" onPress={handleRestart} style={styles.button} />
            </View>
          </GlassCard>
        </View>

        {__DEV__ ? (
          <Modal
            visible={isModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setIsModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Error details</Text>
                  <Pressable
                    onPress={() => setIsModalVisible(false)}
                    accessibilityLabel="Close error details"
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Feather name="x" size={22} color={palette.textHi} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScrollView}
                  contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 16 }]}
                  showsVerticalScrollIndicator
                >
                  <View style={styles.errorContainer}>
                    <Text style={[styles.errorText, { fontFamily: monoFont }]} selectable>
                      {formatErrorDetails()}
                    </Text>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 480,
  },
  card: { alignSelf: "stretch" },
  cardStack: { alignItems: "center", gap: 12 },
  iconDisc: {
    width: MIN_TAP + 8,
    height: MIN_TAP + 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.redWash,
    borderWidth: 1,
    borderColor: palette.redHair,
    marginBottom: 4,
  },
  title: { textAlign: "center" },
  message: { textAlign: "center", marginBottom: 8 },
  topButton: { position: "absolute", right: 16, zIndex: 10 },
  button: { alignSelf: "stretch" },
  modalOverlay: {
    flex: 1,
    backgroundColor: palette.scrim,
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    backgroundColor: palette.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.borderStrong,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderStrong,
  },
  modalTitle: { fontSize: 19, fontFamily: fonts.semi, color: palette.textHi, letterSpacing: -0.3 },
  closeButton: { width: MIN_TAP, height: MIN_TAP, alignItems: "center", justifyContent: "center" },
  modalScrollView: { flex: 1 },
  modalScrollContent: { padding: 16 },
  errorContainer: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    padding: 16,
    backgroundColor: palette.surface,
  },
  errorText: { fontSize: 12, lineHeight: 18, width: "100%", color: palette.textHi },
});
