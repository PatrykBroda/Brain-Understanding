import React, { useState, useCallback } from "react";
import { Alert, Linking, View, ActivityIndicator, StyleSheet, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete, apiUrl } from "@/lib/api";
import { AiConsentStatus } from "@/lib/aiConsent";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import { Button, Display, Eyebrow, GlassCard, Screen } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";

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
      <Screen>
        <View style={s.fullscreen}>
          <Text style={s.wordmark}>FRAME</Text>
          <ActivityIndicator size="small" color={palette.goldLight} style={{ marginTop: 28 }} />
        </View>
      </Screen>
    );
  }

  // 2. Errored
  if (isError) {
    return (
      <Screen tone="red">
        <View style={s.fullscreen}>
          <View style={s.cardWrap}>
            <GlassCard tone="red" radius={32} padding={28}>
              <Eyebrow style={{ color: palette.redLight, textAlign: "center" }}>
                CONNECTION ERROR
              </Eyebrow>
              <Display size="heading" style={s.errorTitle}>
                We can't reach FRAME.
              </Display>
              <Text style={s.errorBody}>
                Could not load your permissions. Please check your connection and try again.
              </Text>

              <Button title="RETRY" onPress={() => refetch()} />

              <View style={s.linksRow}>
                <Pressable
                  style={s.linkBtn}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(apiUrl("/privacy"))}
                >
                  <Text style={s.link}>PRIVACY POLICY</Text>
                </Pressable>
                <Pressable
                  style={s.linkBtn}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(apiUrl("/terms"))}
                >
                  <Text style={s.link}>TERMS OF SERVICE</Text>
                </Pressable>
              </View>

              <Button title="SIGN OUT" variant="glass" onPress={() => void handleSignOut()} />

              <Button
                title="DELETE ACCOUNT"
                variant="danger"
                style={{ marginTop: 12 }}
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
      <Screen>
        <View style={s.fullscreen}>
          {/* The modal mounts over the brand backdrop so no underlying app is visible */}
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
    fontFamily: fonts.numeralXL,
    fontSize: 26,
    letterSpacing: 10,
    color: palette.textHi,
  },
  errorTitle: { textAlign: "center", marginTop: 8, marginBottom: 12 },
  errorBody: {
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 21,
    color: palette.textMid,
    textAlign: "center",
    marginBottom: 28,
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 20,
    marginVertical: 8,
  },
  linkBtn: { minHeight: 44, justifyContent: "center" },
  link: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    color: palette.goldLight,
  },
});
