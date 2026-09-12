import React, { useState, useCallback } from "react";
import { Alert, Linking, View, ActivityIndicator, StyleSheet, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete, apiUrl } from "@/lib/api";
import { AiConsentStatus } from "@/lib/aiConsent";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";

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
      <View style={s.fullscreen}>
        <Text style={s.wordmark}>FRAME</Text>
        <ActivityIndicator size="small" color="#8A6A2F" style={{ marginTop: 28 }} />
      </View>
    );
  }

  // 2. Errored
  if (isError) {
    return (
      <View style={s.fullscreen}>
        <Text style={s.errorTitle}>CONNECTION ERROR</Text>
        <Text style={s.errorBody}>Could not load your permissions. Please check your connection and try again.</Text>

        <Pressable style={s.btnPrimary} onPress={() => refetch()}>
          <Text style={s.btnPrimaryText}>RETRY</Text>
        </Pressable>

        <View style={s.linksRow}>
          <Pressable onPress={() => void Linking.openURL(apiUrl("/privacy"))}>
            <Text style={s.link}>PRIVACY POLICY</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(apiUrl("/terms"))}>
            <Text style={s.link}>TERMS OF SERVICE</Text>
          </Pressable>
        </View>

        <Pressable style={s.btnGhost} onPress={() => void handleSignOut()}>
          <Text style={s.btnGhostText}>SIGN OUT</Text>
        </Pressable>

        <Pressable style={s.btnDanger} onPress={() => void handleDeleteAccount()} disabled={deletingAccount}>
          {deletingAccount ? (
            <ActivityIndicator size="small" color="#bf4040" />
          ) : (
            <Text style={s.btnDangerText}>DELETE ACCOUNT</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // 3. Loaded but not accepted (including absent status due to parsing issues but success response, etc)
  if (!status?.accepted) {
    return (
      <View style={s.fullscreen}>
        {/* We mount Modal on top of a black background so there's no underlying app visible */}
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
    );
  }

  // 4. Accepted
  return <>{children}</>;
}

const s = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 18,
    letterSpacing: 10,
    color: "#e0e0e0",
  },
  errorTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 20,
    color: "#f2f2f2",
    marginBottom: 12,
    textAlign: "center",
  },
  errorBody: {
    fontFamily: "Outfit",
    fontSize: 14,
    lineHeight: 21,
    color: "#aaa",
    textAlign: "center",
    marginBottom: 32,
  },
  btnPrimary: {
    backgroundColor: "#8A6A2F",
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginBottom: 24,
  },
  btnPrimaryText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 2,
    color: "#050505",
  },
  linksRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 32,
  },
  link: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#b99250",
  },
  btnGhost: {
    paddingVertical: 12,
    width: "100%",
    alignItems: "center",
  },
  btnGhostText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#777",
  },
  btnDanger: {
    paddingVertical: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  btnDangerText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#bf4040",
  },
});
