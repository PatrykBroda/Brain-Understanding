import React, { useState, useCallback } from "react";
import { Alert, Linking, View, ActivityIndicator, StyleSheet, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete, apiUrl } from "@/lib/api";
import { AiConsentStatus } from "@/lib/aiConsent";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import { Button, Display, GlassCard, Screen } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { FrameLogo } from "@/components/FrameLogo";
import { OctagonSpinner } from "@/components/OctagonSpinner";

export function AiConsentGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [deletingAccount, setDeletingAccount] = useState(false);

  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useQuery<AiConsentStatus>({
    queryKey: ["ai-consent"],
    queryFn: () => apiGet<AiConsentStatus>("/ai-consent"),
    enabled: isLoaded && isSignedIn,
    retry: false, // Fail fast to show error state if network is down
  });

  const accept = useMutation({
    mutationFn: () => apiPatch<AiConsentStatus>("/ai-consent", { accepted: true }),
    onSuccess: (newStatus) => {
      qc.setQueryData(["ai-consent"], newStatus);
    },
    onError: (e) => {
      Alert.alert(
        "Permission not saved",
        e instanceof Error ? e.message : "Could not save AI permission. Please try again."
      );
    },
  });

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace("/sign-in");
  }, [signOut, router]);

  const handleDeleteAccount = useCallback(async () => {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your FRAME profile, conversations, analysis history and training data. Your App Store subscription is managed separately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete everything permanently?",
              "This cannot be undone.",
              [
                { text: "Keep account", style: "cancel" },
                {
                  text: "Delete account",
                  style: "destructive",
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await apiDelete<{ deleted: true }>("/account");
                      await signOut();
                      router.replace("/sign-in");
                    } catch (error) {
                      Alert.alert(
                        "Could not delete account",
                        error instanceof Error ? error.message : "Please try again."
                      );
                    } finally {
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [signOut, router]);

  // When signed out, render children (auth flows)
  if (isLoaded && !isSignedIn) {
    return <>{children}</>;
  }

  // When signed in:
  // 1. Loading
  if (isLoading || !isLoaded) {
    return (
      <Screen light="silver" focus="top">
        <View style={s.fullscreen} accessibilityLabel="Loading">
          <FrameLogo height={18} />
          <View style={{ marginTop: 24 }}>
            <OctagonSpinner size={44} color={palette.gold} />
          </View>
        </View>
      </Screen>
    );
  }

  // 2. Errored
  if (isError) {
    return (
      <Screen light={null}>
        <View style={s.fullscreen}>
          <View style={s.cardWrap}>
            <GlassCard tone="red" radius={radius.xl} padding={24} raised>
              <View accessibilityRole="alert" style={s.errorStack}>
                <View style={s.errorIcon}>
                  <Feather name="wifi-off" size={20} color={palette.redText} />
                </View>
                <Display size="heading" style={s.errorTitle}>
                  We can't reach FRAME
                </Display>
                <Text style={s.errorBody}>
                  Could not load your permissions. Please check your connection and try again.
                </Text>
              </View>

              <Button title="Retry" onPress={() => refetch()} />
              <Button title="Sign out" variant="secondary" onPress={() => void handleSignOut()} style={{ marginTop: 10 }} />

              <View style={s.linksRow}>
                <Pressable style={s.linkBtn} accessibilityRole="link" onPress={() => void Linking.openURL(apiUrl("/privacy"))}>
                  <Text style={s.link}>Privacy policy</Text>
                </Pressable>
                <Pressable style={s.linkBtn} accessibilityRole="link" onPress={() => void Linking.openURL(apiUrl("/terms"))}>
                  <Text style={s.link}>Terms of service</Text>
                </Pressable>
              </View>

              <Button
                title="Delete account"
                variant="danger"
                loading={deletingAccount}
                onPress={() => void handleDeleteAccount()}
              />
            </GlassCard>
          </View>
        </View>
      </Screen>
    );
  }

  // 3. Loaded but not accepted (including absent status due to parsing issues but success response, etc)
  if (!status?.accepted) {
    return (
      <Screen light="silver" focus="top">
        <View style={s.fullscreen}>
          {/* The modal mounts over the canvas so no underlying app is visible */}
          <AiConsentModal
            visible={true}
            mandatory={true}
            status={status ?? null}
            busy={accept.isPending || deletingAccount}
            onAccept={() => accept.mutate()}
            onPrivacy={() => void Linking.openURL(apiUrl("/privacy"))}
            onTerms={() => void Linking.openURL(apiUrl("/terms"))}
            onSignOut={() => void handleSignOut()}
            onDeleteAccount={() => void handleDeleteAccount()}
          />
        </View>
      </Screen>
    );
  }

  // 4. Accepted
  return <>{children}</>;
}

const s = StyleSheet.create({
  fullscreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cardWrap: { width: "100%", maxWidth: 420 },
  wordmark: {
    fontFamily: fonts.semi,
    fontSize: 22,
    letterSpacing: 8,
    color: palette.textHi,
  },
  errorStack: { alignItems: "center", gap: 8, marginBottom: 20 },
  errorIcon: {
    width: MIN_TAP + 4,
    height: MIN_TAP + 4,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.redWash,
    borderWidth: 1,
    borderColor: palette.redHair,
    marginBottom: 4,
  },
  errorTitle: { textAlign: "center" },
  errorBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.textMid,
    textAlign: "center",
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 24,
    marginVertical: 8,
  },
  linkBtn: { minHeight: MIN_TAP, justifyContent: "center" },
  link: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
});
