import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
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
import { Button, Display, EmptyState, Eyebrow, FadeIn, IconButton, Screen, haptic } from "@/components/ui";
import { fonts, palette, radius, SCREEN_PAD } from "@/constants/theme";

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
  // Visual selection only: the CTA buys whichever plan is selected.
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const plansReady = isPurchasesSupported() && Platform.OS === "ios" && !loadError && packages.length > 0;
  const selected = packages.find((p) => p.identifier === selectedId) ?? packages[0] ?? null;
  const busy = !!busyId;
  const off = busy || restoring;

  return (
    <Screen light="champagne" focus="top" intensity={0.8}>
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
            <View style={s.perks}>
              {FRAME_PLUS_PERKS.map((p) => (
                <View key={p} style={s.perkRow}>
                  <Feather name="check" size={16} color={palette.gold} />
                  <Text style={s.perkText}>{p}</Text>
                </View>
              ))}
            </View>
          </FadeIn>

          <FadeIn index={1}>
            {loading ? (
              <EmptyState kind="loading" title="Loading plans" body="Checking current App Store prices." />
            ) : !isPurchasesSupported() || Platform.OS !== "ios" ? (
              <EmptyState icon="smartphone" title="Subscriptions are in the iOS app" body="Open FRAME on your iPhone to see plans and subscribe." />
            ) : !plansReady ? (
              <View>
                <EmptyState
                  kind="error"
                  title="Plans unavailable"
                  body="Current App Store prices aren't available, so purchases are paused. You can still restore an existing subscription."
                  actionLabel="Try again"
                  onAction={() => setLoadAttempt((attempt) => attempt + 1)}
                />
                {__DEV__ && loadError ? <Text style={s.diagnostic}>{loadError}</Text> : null}
              </View>
            ) : (
              <View style={s.plans} accessibilityRole="radiogroup">
                {packages.map((pkg) => {
                  const period = getSubscriptionPeriodLabel(pkg);
                  if (!period) return null;
                  const isSel = selected?.identifier === pkg.identifier;
                  return (
                    <Pressable
                      key={pkg.identifier}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSel, disabled: off }}
                      disabled={off}
                      onPress={() => {
                        haptic.select();
                        setSelectedId(pkg.identifier);
                      }}
                      style={({ pressed }) => [
                        s.planCard,
                        isSel && s.planCardOn,
                        pressed && !isSel && { backgroundColor: palette.raised },
                        off && { opacity: 0.6 },
                      ]}
                    >
                      <View style={s.planCopy}>
                        <Text style={s.planTitle}>{getSubscriptionPlanLabel(pkg.product.title)}</Text>
                        <Text style={s.planPrice}>{formatSubscriptionRenewal(pkg.applePrice.localizedPrice, period)}</Text>
                      </View>
                      <View style={[s.radio, isSel && s.radioOn]}>
                        {isSel ? <Feather name="check" size={14} color={palette.onGold} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
                <Text style={s.periodServices}>Every subscription period includes all FRAME+ services listed above.</Text>
                <Button
                  title="Continue"
                  onPress={() => selected && void onBuy(selected)}
                  loading={busy}
                  disabled={!selected || restoring}
                  style={s.cta}
                />
                <Text style={s.charge}>Nothing is charged until you confirm with Apple.</Text>
              </View>
            )}

            <Button
              title="Restore purchases"
              variant="ghost"
              style={s.restoreBtn}
              onPress={onRestore}
              loading={restoring}
              disabled={busy}
            />

            <Text style={s.legal}>
              Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current
              period. Manage or cancel anytime in your{Platform.OS === "ios" ? " App Store" : " store"} account
              settings.
            </Text>
            <View style={s.legalLinks}>
              <Pressable
                onPress={() => void Linking.openURL(apiUrl("/privacy"))}
                accessibilityRole="link"
                accessibilityLabel="Open Privacy Policy"
                style={s.legalBtn}
              >
                <Text style={s.legalLink}>Privacy policy</Text>
              </Pressable>
              <Pressable
                onPress={() => void Linking.openURL(apiUrl("/terms"))}
                accessibilityRole="link"
                accessibilityLabel="Open Terms of Use"
                style={s.legalBtn}
              >
                <Text style={s.legalLink}>Terms of use (EULA)</Text>
              </Pressable>
              {Platform.OS === "ios" ? (
                <Pressable
                  onPress={() => void Linking.openURL("https://apps.apple.com/account/subscriptions")}
                  accessibilityRole="link"
                  accessibilityLabel="Manage App Store subscriptions"
                  style={s.legalBtn}
                >
                  <Text style={s.legalLink}>Manage subscription</Text>
                </Pressable>
              ) : null}
            </View>
          </FadeIn>
        </ScrollView>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SCREEN_PAD },
  closeRow: { alignItems: "flex-end" },
  content: { paddingTop: 4 },
  kicker: { color: palette.gold, marginBottom: 8 },
  title: { marginBottom: 20 },
  perks: { gap: 12, marginBottom: 28 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  perkText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: palette.textHi },
  plans: { gap: 12 },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: 18,
    paddingHorizontal: 20,
    minHeight: 76,
  },
  planCardOn: { borderColor: palette.gold, backgroundColor: palette.raised },
  planCopy: { flex: 1, flexShrink: 1, minWidth: 0, gap: 4 },
  planTitle: { fontFamily: fonts.semi, fontSize: 18, color: palette.textHi },
  planPrice: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, fontVariant: ["tabular-nums"] },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: 14,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { backgroundColor: palette.gold, borderColor: palette.gold },
  periodServices: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: palette.textLow, marginTop: 4 },
  cta: { marginTop: 8 },
  charge: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid, textAlign: "center" },
  diagnostic: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow, textAlign: "center", lineHeight: 16, marginTop: 8 },
  restoreBtn: { marginTop: 8 },
  legal: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow, textAlign: "center", lineHeight: 17, marginTop: 12 },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 16,
    marginTop: 4,
    paddingBottom: 8,
  },
  legalBtn: { minHeight: 44, justifyContent: "center" },
  legalLink: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, textDecorationLine: "underline" },
});
