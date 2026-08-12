import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  restorePurchases,
  hasFramePlus,
  isPurchasesSupported,
  type PurchasesPackage,
} from "@/lib/purchases";
import { useSyncBilling } from "@/hooks/useEntitlement";

const FRAME_PLUS_PERKS = [
  "Unlimited session analysis",
  "Full athlete model + memory",
  "Competition camp planner",
  "Priority coaching depth",
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sync = useSyncBilling();

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let alive = true;
    getFramePlusPackages()
      .then((pkgs) => {
        if (alive) setPackages(pkgs);
      })
      .catch(() => {
        if (alive) setPackages([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }

  async function onBuy(pkg: PurchasesPackage) {
    setBusyId(pkg.identifier);
    try {
      const info = await purchasePackage(pkg);
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
              <Feather name="check" size={14} color="#C9883A" />
              <Text style={s.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#C9883A" style={{ marginTop: 32 }} />
        ) : !isPurchasesSupported() ? (
          <Text style={s.unavailable}>
            Subscriptions are available in the iOS app.
          </Text>
        ) : packages.length === 0 ? (
          <Text style={s.unavailable}>
            Plans aren&apos;t available right now. Please try again shortly.
          </Text>
        ) : (
          packages.map((pkg) => {
            const busy = busyId === pkg.identifier;
            return (
              <Pressable
                key={pkg.identifier}
                style={({ pressed }) => [s.planBtn, pressed && s.pressed]}
                disabled={!!busyId || restoring}
                onPress={() => onBuy(pkg)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.planTitle}>{pkg.product.title}</Text>
                  <Text style={s.planPrice}>{pkg.product.priceString}</Text>
                </View>
                {busy ? (
                  <ActivityIndicator color="#050505" />
                ) : (
                  <Feather name="arrow-right" size={16} color="#050505" />
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
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505", paddingHorizontal: 24 },
  closeBtn: { alignSelf: "flex-end", padding: 8 },
  content: { paddingTop: 12 },
  kicker: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: "#C9883A",
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
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C9883A",
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  planTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: "#050505",
  },
  planPrice: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    color: "#3a2a12",
    marginTop: 2,
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
});
