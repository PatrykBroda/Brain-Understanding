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
} from "@/lib/purchases";
import { useSyncBilling } from "@/hooks/useEntitlement";
import { apiUrl } from "@/lib/api";
import { didVerifiedPriceChange, toShownPriceReport, verifyApplePrice, type VerifiedPackage } from "@/lib/applePrice";
import { formatSubscriptionRenewal } from "@/lib/subscriptionDisclosure";
import { reportCrash, reportPriceShown } from "@/lib/crashReporter";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Display, Eyebrow, FadeIn, GlassCard, IconButton, Screen, media } from "@/components/ui";
import { fonts, palette, radius, shadow } from "@/constants/theme";

const FRAME_PLUS_PERKS = [
  "Unlimited coaching conversations",
  "Video analysis and opponent scouting",
  "Full athlete model + memory",
  "Competition camp planner",
  "Priority coaching depth",
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sync = useSyncBilling();

  const [packages, setPackages] = useState<VerifiedPackage[]>([]);
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
        .then((pkgs) => Promise.all(pkgs.map(verifyApplePrice)))
        .then((pkgs) => {
          if (alive && generation === loadGeneration) {
            for (const shown of pkgs) reportPriceShown(toShownPriceReport("shown", shown));
            setPackages(pkgs);
          }
        })
        .catch((error) => {
          console.warn("StoreKit product refresh failed", error);
          // Send it to the server too. On TestFlight there is no console, and
          // this catch is where a storefront/currency disagreement surfaces —
          // the one thing needed to tell "Apple is unreachable" apart from
          // "the App Store country is being reported wrong".
          reportCrash(
            error instanceof Error ? error : new Error(String(error)),
            "paywall-price-load",
          );
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

  async function onBuy(pkg: VerifiedPackage) {
    setBusyId(pkg.identifier);
    let checkingPrice = true;
    try {
      const preparation = await preparePackageForPurchase(pkg);
      // Query Apple again before opening the native purchase sheet. A failed
      // check blocks purchase rather than silently using TestFlight's USD.
      const checked = await verifyApplePrice(preparation.pkg);
      reportPriceShown(toShownPriceReport("prepurchase", checked));
      // StoreKit's priceString/currencyCode can change from one wrong
      // TestFlight value to another. Only a changed product/period/storefront
      // or Apple's independently checked price requires another confirmation.
      if (didVerifiedPriceChange(pkg, checked)) {
        setPackages((current) =>
          current.map((item) =>
            item.identifier === checked.identifier
              ? checked
              : item,
          ),
        );
        Alert.alert(
          "Subscription details updated",
          "Apple returned new price or storefront information. Review the plan and tap again to continue.",
        );
        return;
      }
      checkingPrice = false;
      const info = await purchasePackage(checked);
      await sync.mutateAsync();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (hasFramePlus(info)) {
        close();
      }
    } catch (err) {
      const e = err as { userCancelled?: boolean; message?: string };
      if (checkingPrice) {
        // A failed last-minute check invalidates the displayed price. Do not
        // leave a stale, tappable plan on screen while checkout is unavailable.
        setPackages([]);
        setLoadError("The current App Store price could not be verified.");
        Alert.alert(
          "Current price unavailable",
          "Purchases are paused until the App Store price can be checked again. You can still restore a subscription.",
        );
      } else if (!e?.userCancelled) {
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
    <Screen photo={media.stillA}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <View style={s.closeRow}>
          <IconButton icon="x" label="Close" onPress={close} />
        </View>

        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0}>
            <Eyebrow style={s.kicker}>FRAME+</Eyebrow>
            <Display size="title" style={s.title}>
              Train with the full system
            </Display>
          </FadeIn>

          <FadeIn index={1}>
            <GlassCard tone="gold" radius={28} padding={22} style={s.perksCard}>
              <View style={s.perks}>
                {FRAME_PLUS_PERKS.map((p) => (
                  <View key={p} style={s.perkRow}>
                    <View style={s.perkDot}>
                      <Feather name="check" size={12} color={palette.goldPale} />
                    </View>
                    <Text style={s.perkText}>{p}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.periodServices}>
                Every subscription period includes all FRAME+ services listed above.
              </Text>
            </GlassCard>
          </FadeIn>

          <FadeIn index={2}>
            {loading ? (
              <ActivityIndicator color={palette.goldLight} style={{ marginTop: 32 }} />
            ) : !isPurchasesSupported() || Platform.OS !== "ios" ? (
              <Text style={s.unavailable}>
                Subscriptions are available in the iOS app.
              </Text>
            ) : loadError || packages.length === 0 ? (
              <View style={s.unavailableWrap}>
                <Text style={s.unavailable}>
                  Current App Store prices aren&apos;t available. Purchases are paused;
                  you can still restore an existing subscription.
                </Text>
                {__DEV__ && loadError ? (
                  <Text style={s.diagnostic}>{loadError}</Text>
                ) : null}
                <Button
                  title="TRY AGAIN"
                  variant="glass"
                  style={{ marginTop: 16 }}
                  onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                />
              </View>
            ) : (
              <View style={s.plans}>
                {packages.map((pkg) => {
                  const busy = busyId === pkg.identifier;
                  const period = getSubscriptionPeriodLabel(pkg);
                  if (!period) return null;
                  const off = !!busyId || restoring;
                  return (
                    <Pressable
                      key={pkg.identifier}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: off, busy }}
                      style={({ pressed }) => [
                        shadow.glow,
                        s.planBtn,
                        pressed && s.pressed,
                        off && !busy && { opacity: 0.55 },
                      ]}
                      disabled={off}
                      onPress={() => onBuy(pkg)}
                    >
                      <LinearGradient
                        colors={["rgba(199,161,90,0.38)", "rgba(138,106,47,0.16)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={s.planCopy}>
                        <Text style={s.planTitle}>
                          {getSubscriptionPlanLabel(pkg.product.title)}
                        </Text>
                        <Text style={s.planPrice}>
                          {formatSubscriptionRenewal(pkg.applePrice.localizedPrice, period)}
                        </Text>
                        <Text style={s.planIncludes}>
                          Nothing is charged until you confirm with Apple.
                        </Text>
                      </View>
                      <View style={s.planAction}>
                        {busy ? (
                          <ActivityIndicator color="#050505" />
                        ) : (
                          <Feather name="arrow-right" size={18} color="#050505" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Button
              title="RESTORE PURCHASES"
              variant="glass"
              style={s.restoreBtn}
              onPress={onRestore}
              loading={restoring}
              disabled={!!busyId}
            />

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
                style={s.legalBtn}
              >
                <Text style={s.legalLink}>PRIVACY POLICY</Text>
              </Pressable>
              <Text style={s.legalDivider}>·</Text>
              <Pressable
                onPress={() => void Linking.openURL(apiUrl("/terms"))}
                accessibilityRole="link"
                accessibilityLabel="Open Terms of Use"
                style={s.legalBtn}
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
                    style={s.legalBtn}
                  >
                    <Text style={s.legalLink}>MANAGE SUBSCRIPTION</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </FadeIn>
        </ScrollView>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  closeRow: { alignItems: "flex-end" },
  content: { paddingTop: 4 },
  kicker: { color: palette.goldLight, marginBottom: 8 },
  title: { marginBottom: 24 },
  perksCard: { marginBottom: 28 },
  perks: { gap: 14, marginBottom: 18 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  perkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
  },
  perkText: { flex: 1, fontFamily: fonts.text, fontSize: 15, color: palette.text },
  periodServices: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    color: palette.textMid,
    lineHeight: 19,
  },
  plans: { gap: 14 },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.goldHair,
    backgroundColor: palette.graphite2,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  planCopy: { flex: 1, flexShrink: 1, minWidth: 0 },
  planAction: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#B38F4B",
    marginLeft: 14,
  },
  planTitle: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: palette.goldPale,
    flexShrink: 1,
  },
  planPrice: {
    fontFamily: fonts.numeral,
    fontSize: 20,
    color: palette.textHi,
    lineHeight: 27,
    marginTop: 6,
    flexShrink: 1,
  },
  planIncludes: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: palette.textMid,
    lineHeight: 17,
    marginTop: 6,
    flexShrink: 1,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  unavailable: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.textMid,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 21,
  },
  unavailableWrap: { alignItems: "center" },
  diagnostic: {
    fontFamily: fonts.text,
    fontSize: 11,
    color: palette.textLow,
    textAlign: "center",
    lineHeight: 15,
    marginTop: 8,
  },
  restoreBtn: { marginTop: 20 },
  legal: {
    fontFamily: fonts.text,
    fontSize: 11.5,
    color: palette.textLow,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 20,
  },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 8,
    marginTop: 8,
    paddingBottom: 8,
  },
  legalBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  legalLink: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    color: palette.goldLight,
    letterSpacing: 1.2,
    textDecorationLine: "underline",
  },
  legalDivider: { color: palette.textLow, fontSize: 12 },
});
