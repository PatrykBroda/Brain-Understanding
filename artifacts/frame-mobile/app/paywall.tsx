import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  getFramePlusPackages,
  purchasePackage,
  preparePackageForPurchase,
  restorePurchases,
  hasFramePlus,
  getSubscriptionPeriodLabel,
  getSubscriptionPlanLabel,
  isPurchasesSupported,
  shouldRefreshStoreProducts,
  type FreshPurchasesPackage,
} from "@/lib/purchases";
import { useSyncBilling } from "@/hooks/useEntitlement";
import { apiUrl } from "@/lib/api";

const FRAME_PLUS_PERKS = [
  "Unlimited coaching conversations",
  "Full athlete model + memory",
  "Competition camp planner",
  "Priority coaching depth",
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sync = useSyncBilling();

  const [packages, setPackages] = useState<FreshPurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let alive = true;
    let loadGeneration = 0;

    const loadPackages = () => {
      const generation = ++loadGeneration;
      setPackages([]);
      setLoading(true);
      setLoadError(null);
      void getFramePlusPackages()
        .then((pkgs) => {
          if (alive && generation === loadGeneration) setPackages(pkgs);
        })
        .catch((error) => {
          console.warn("StoreKit product refresh failed", error);
          if (alive && generation === loadGeneration) {
            setPackages([]);
            setLoadError(
              error instanceof Error
                ? error.message
                : "Plans could not be loaded from the App Store.",
            );
          }
        })
        .finally(() => {
          if (alive && generation === loadGeneration) setLoading(false);
        });
    };

    loadPackages();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (shouldRefreshStoreProducts(state)) loadPackages();
    });

    return () => {
      alive = false;
      appStateSubscription.remove();
    };
  }, [loadAttempt]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }

  async function onBuy(pkg: FreshPurchasesPackage) {
    setBusyId(pkg.identifier);
    try {
      const preparation = await preparePackageForPurchase(pkg);
      if (preparation.status === "changed") {
        setPackages((current) =>
          current.map((item) =>
            item.identifier === preparation.pkg.identifier
              ? preparation.pkg
              : item,
          ),
        );
        Alert.alert(
          "App Store details updated",
          "Apple returned new storefront information. Review the plan and tap again to continue.",
        );
        return;
      }
      const info = await purchasePackage(preparation.pkg);
      await sync.mutateAsync();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (hasFramePlus(info)) {
        close();
      }
    } catch (err) {
      const e = err as { userCancelled?: boolean; message?: string };
      if (!e?.userCancelled) {
        Alert.alert("Purchase failed", e?.message ?? "Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onRestore() {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      await sync.mutateAsync();
      if (hasFramePlus(info)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        close();
      } else {
        Alert.alert("Nothing to restore", "No active FRAME+ subscription was found.");
      }
    } catch (e) {
      Alert.alert("Restore failed", (e as Error)?.message ?? "Please try again.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <Pressable style={s.closeBtn} onPress={close} hitSlop={12}>
        <Feather name="x" size={20} color="#666" />
      </Pressable>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.kicker}>FRAME+</Text>
        <Text style={s.title}>Train with the full system</Text>

        <View style={s.perks}>
          {FRAME_PLUS_PERKS.map((p) => (
            <View key={p} style={s.perkRow}>
              <Feather name="check" size={14} color="#8A6A2F" />
              <Text style={s.perkText}>{p}</Text>
            </View>
          ))}
          <Text style={s.periodServices}>
            Every subscription period includes all FRAME+ services listed above.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#8A6A2F" style={{ marginTop: 32 }} />
        ) : !isPurchasesSupported() ? (
          <Text style={s.unavailable}>
            Subscriptions are available in the iOS app.
          </Text>
        ) : loadError || packages.length === 0 ? (
          <View style={s.unavailableWrap}>
            <Text style={s.unavailable}>
              Plans aren&apos;t available right now. Please try again.
            </Text>
            {__DEV__ && loadError ? (
              <Text style={s.diagnostic}>{loadError}</Text>
            ) : null}
            <Pressable
              style={({ pressed }) => [s.retryBtn, pressed && s.pressed]}
              onPress={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              <Text style={s.retryText}>TRY AGAIN</Text>
            </Pressable>
          </View>
        ) : (
          packages.map((pkg) => {
            const busy = busyId === pkg.identifier;
            const period = getSubscriptionPeriodLabel(pkg);
            if (!period) return null;
            return (
              <Pressable
                key={pkg.identifier}
                style={({ pressed }) => [s.planBtn, pressed && s.pressed]}
                disabled={!!busyId || restoring}
                onPress={() => onBuy(pkg)}
              >
                <View style={s.planCopy}>
                  <Text style={s.planTitle}>
                    {getSubscriptionPlanLabel(pkg.product.title)}
                  </Text>
                  {/*
                    RevenueCat documents that TestFlight can return USD product
                    metadata while Apple's confirmation uses the real storefront
                    currency. TestFlight cannot be identified reliably from this
                    managed build, so do not present an amount that may be false.
                  */}
                  <Text style={s.planPrice}>Billing period: {period}</Text>
                  <Text style={s.planIncludes}>
                    Tap to review Apple&apos;s exact local price. Nothing is charged
                    until you confirm.
                  </Text>
                </View>
                {busy ? (
                  <View style={s.planAction}>
                    <ActivityIndicator color="#050505" />
                  </View>
                ) : (
                  <View style={s.planAction}>
                    <Feather name="arrow-right" size={16} color="#050505" />
                  </View>
                )}
              </Pressable>
            );
          })
        )}

        <Pressable
          style={s.restoreBtn}
          onPress={onRestore}
          disabled={restoring || !!busyId}
        >
          {restoring ? (
            <ActivityIndicator color="#666" />
          ) : (
            <Text style={s.restoreText}>RESTORE PURCHASES</Text>
          )}
        </Pressable>

        <Text style={s.legal}>
          Subscriptions renew automatically unless cancelled at least 24 hours
          before the end of the current period. Manage or cancel anytime in your
          {Platform.OS === "ios" ? " App Store" : " store"} account settings.
        </Text>
        <View style={s.legalLinks}>
          <Pressable
            onPress={() => void Linking.openURL(apiUrl("/privacy"))}
            accessibilityRole="link"
            accessibilityLabel="Open Privacy Policy"
            hitSlop={8}
          >
            <Text style={s.legalLink}>PRIVACY POLICY</Text>
          </Pressable>
          <Text style={s.legalDivider}>·</Text>
          <Pressable
            onPress={() => void Linking.openURL(apiUrl("/terms"))}
            accessibilityRole="link"
            accessibilityLabel="Open Terms of Use"
            hitSlop={8}
          >
            <Text style={s.legalLink}>TERMS OF USE (EULA)</Text>
          </Pressable>
          {Platform.OS === "ios" ? (
            <>
              <Text style={s.legalDivider}>·</Text>
              <Pressable
                onPress={() =>
                  void Linking.openURL("https://apps.apple.com/account/subscriptions")
                }
                accessibilityRole="link"
                accessibilityLabel="Manage App Store subscriptions"
                hitSlop={8}
              >
                <Text style={s.legalLink}>MANAGE SUBSCRIPTION</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505", paddingHorizontal: 16 },
  closeBtn: { alignSelf: "flex-end", padding: 8 },
  content: { paddingTop: 12 },
  kicker: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: "#8A6A2F",
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 28,
    color: "#e0e0e0",
    lineHeight: 34,
    marginBottom: 28,
  },
  perks: { gap: 12, marginBottom: 32 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkText: { fontFamily: "Outfit", fontSize: 15, color: "#bbb" },
  periodServices: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13,
    color: "#d0d0d0",
    lineHeight: 19,
    marginTop: 8,
  },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8A6A2F",
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  planCopy: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  planAction: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    minHeight: 44,
    marginLeft: 12,
  },
  planTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: "#050505",
    flexShrink: 1,
  },
  planPrice: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    color: "#3a2a12",
    lineHeight: 18,
    marginTop: 2,
    flexShrink: 1,
  },
  planIncludes: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#2d210f",
    lineHeight: 15,
    marginTop: 4,
    flexShrink: 1,
  },
  pressed: { opacity: 0.8 },
  unavailable: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 24,
    lineHeight: 20,
  },
  unavailableWrap: { alignItems: "center" },
  diagnostic: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#555",
    textAlign: "center",
    lineHeight: 14,
    marginTop: 8,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: "#252525",
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 16,
  },
  retryText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#888",
    letterSpacing: 2,
  },
  restoreBtn: { alignItems: "center", paddingVertical: 18, marginTop: 8 },
  restoreText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#666",
    letterSpacing: 3,
  },
  legal: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#444",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 12,
  },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingBottom: 8,
  },
  legalLink: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#8A6A2F",
    letterSpacing: 1.2,
    textDecorationLine: "underline",
  },
  legalDivider: { color: "#444", fontSize: 12 },
});
