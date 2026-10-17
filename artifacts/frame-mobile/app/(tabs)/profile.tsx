import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ArcGauge, Display, Punch, Eyebrow, FadeIn, Screen, media } from "@/components/ui";
import { fonts, palette, radius, shadow } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useFighter, type Fighter } from "@/context/FighterContext";
import { apiDelete, apiGet, apiPatch, apiUrl, getAuthToken, heroFileUrl, uploadHero, removeHero } from "@/lib/api";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { primaryFocus } from "@/lib/primaryFocus";
import { useActiveCompetition } from "@/hooks/useCompetition";
import { Belt } from "@/components/Belt";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { isBjjSport } from "@/lib/fighterOptions";
import { useEntitlement, useSyncBilling } from "@/hooks/useEntitlement";
import { restorePurchases, hasFramePlus } from "@/lib/purchases";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  computeAthleteModel,
  confidenceCopy,
  deriveFrameState,
  formatHeartbeat,
  getArchetype,
  leadClause,
  type ModelFact,
} from "@/lib/athleteModel";

const ACCENT = palette.goldLight;

// 12MB ceiling mirrors the web upload guard; base64 is ~4/3 the byte size.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

// ─── Confidence pips (fact 1–5) ───────────────────────────────────────────────
function FactConfidence({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <View style={cd.wrap}>
      <View style={cd.row}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[cd.pip, i <= v ? cd.active : cd.inactive]} />
        ))}
      </View>
      <Text style={cd.count}>{v}/5</Text>
    </View>
  );
}
// ─── Editorial section header (overline + title) ──────────────────────────────
function SectionHead({ overline, title }: { overline: string; title: string }) {
  return (
    <View style={s.headBlock}>
      <Text style={s.headOverline}>{overline}</Text>
      <Text style={s.headTitle}>{title}</Text>
    </View>
  );
}

// ─── Identity/state row (label · value · sub) ─────────────────────────────────
function DataRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.dataRow}>
      <Text style={s.dataLabel}>{label}</Text>
      <View style={s.dataValueWrap}>
        <Text style={s.dataValue} numberOfLines={2}>
          {value}
        </Text>
        {sub ? (
          <Text style={s.dataSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Locked FRAME+ stub (section stays visible; body is upgrade tap-row) ──────
function LockedBody({ note, onTap }: { note: string; onTap: () => void }) {
  return (
    <Pressable style={s.lockRow} onPress={onTap}>
      <Feather name="lock" size={14} color={palette.textLow} style={{ marginTop: 1 }} />
      <Text style={s.lockNote}>{note}</Text>
      <Text style={s.lockBadge}>FRAME+</Text>
    </Pressable>
  );
}

// ─── DNA radar (react-native-svg port of the web RadarChart) ──────────────────
function RadarChart({ dims }: { dims: { label: string; value: number }[] }) {
  const n = dims.length;
  const cx = 95;
  const cy = 95;
  const r = 62;
  const angles = dims.map((_, i) => (2 * Math.PI * i) / n - Math.PI / 2);
  const pt = (level: number, i: number) => ({
    x: cx + r * level * Math.cos(angles[i]),
    y: cy + r * level * Math.sin(angles[i]),
  });
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const filledPoints = dims.map((d, i) => pt(Math.max(0.04, d.value), i));
  const filledPath =
    filledPoints
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ") + " Z";

  return (
    <Svg viewBox="-18 0 226 190" width="100%" height={210} style={{ alignSelf: "center", maxWidth: 260 }}>
      {gridLevels.map((level) => (
        <Polygon
          key={level}
          points={angles.map((_, i) => {
            const p = pt(level, i);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(255,244,224,0.10)"
          strokeWidth={1}
        />
      ))}
      {angles.map((_, i) => {
        const end = pt(1, i);
        return (
          <Line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x.toFixed(1)}
            y2={end.y.toFixed(1)}
            stroke="rgba(255,244,224,0.10)"
            strokeWidth={1}
          />
        );
      })}
      <Path d={filledPath} fill="rgba(199,161,90,0.16)" stroke="#C7A15A" strokeWidth={1.2} strokeLinejoin="round" />
      {filledPoints.map((p, i) => (
        <Circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={2.5} fill={ACCENT} />
      ))}
      {dims.map((d, i) => {
        const lp = pt(1.38, i);
        return (
          <SvgText
            key={i}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor="middle"
            fontSize={8}
            fontFamily="Outfit"
            fill="#a8a49d"
          >
            {d.label.toUpperCase()}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── Hero identity band — the cover photo, changeable in place ────────────
function IdentityBand({ fighter, subtitle }: { fighter: Fighter; subtitle?: string | null }) {
  const qc = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [heroToken, setHeroToken] = useState<string | null>(null);

  // Fetch the auth token so we can pass it as a header on the hero Image request.
  // React Native's Image doesn't send auth headers automatically; without this
  // the GET /fighter/hero/file returns 401 and the photo never renders.
  useEffect(() => {
    getAuthToken().then(setHeroToken);
  }, [fighter.updatedAt]);

  const upload = useMutation({
    mutationFn: (payload: { mimeType: string; filename: string; dataBase64: string }) =>
      uploadHero<{ fighter: Fighter }>(payload),
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["fighter"] });
    },
    onError: (e) => setUploadError(e instanceof Error ? e.message : "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: () => removeHero<{ fighter: Fighter }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fighter"] }),
  });

  const busy = upload.isPending || remove.isPending;
  const hasHero = (fighter.heroImageUrl ?? "").trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter.updatedAt) : null;
  const zoom = (fighter.heroZoom ?? 100) / 100;

  async function pickHero() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setUploadError("Photo library access is required to set a cover photo.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setUploadError("Couldn't read that image. Try another.");
      return;
    }
    if (asset.base64.length * 0.75 > MAX_IMAGE_BYTES) {
      setUploadError("Image too large (max 12MB).");
      return;
    }
    upload.mutate({
      mimeType: asset.mimeType ?? "image/jpeg",
      filename: asset.fileName ?? "hero.jpg",
      dataBase64: asset.base64,
    });
  }

  return (
    <View>
      <View style={s.band}>
        {heroSrc ? (
          <Image
            source={{
              uri: heroSrc,
              ...(heroToken ? { headers: { Authorization: `Bearer ${heroToken}` } } : {}),
            }}
            style={[StyleSheet.absoluteFill, { opacity: 0.42, transform: [{ scale: zoom }] }]}
            resizeMode="cover"
          />
        ) : (
          <>
            <Image source={media.gym} style={[StyleSheet.absoluteFill, { opacity: 0.7 }]} resizeMode="cover" />
            <LinearGradient
              colors={["rgba(214,120,40,0.32)", "rgba(5,5,5,0)"]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.3, y: 0.7 }}
              style={StyleSheet.absoluteFill}
            />
          </>
        )}
        <LinearGradient
          colors={["rgba(5,5,5,0.15)", "rgba(5,5,5,0.4)", "rgba(5,5,5,0.92)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={s.bandControls}>
          {hasHero && (
            <Pressable
              onPress={() => remove.mutate()}
              disabled={busy}
              style={[s.bandBtn, busy && { opacity: 0.4 }]}
              hitSlop={8}
              accessibilityLabel="Remove cover photo"
            >
              <Feather name="trash-2" size={16} color={palette.text} />
            </Pressable>
          )}
          <Pressable
            onPress={pickHero}
            disabled={busy}
            style={[s.bandBtn, busy && { opacity: 0.4 }]}
            hitSlop={8}
            accessibilityLabel={hasHero ? "Change cover photo" : "Add cover photo"}
          >
            {busy ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <Feather name="camera" size={16} color={ACCENT} />
            )}
          </Pressable>
        </View>

        <View style={s.bandBody}>
          <Eyebrow style={s.bandKicker}>IDENTITY</Eyebrow>
          <Punch style={s.bandName} numberOfLines={2}>
            {fighter.name}
          </Punch>
          {subtitle ? <Text style={s.bandArchetype}>{subtitle.toUpperCase()}</Text> : null}
        </View>
      </View>
      {uploadError && <Text style={s.bandError}>{uploadError}</Text>}
    </View>
  );
}

export default function ProfileScreen() {
  const { signOut, isSignedIn, email } = useAuth();
  const { fighter, isLoading: fighterLoading, refetch } = useFighter();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [editVisible, setEditVisible] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [withdrawingAi, setWithdrawingAi] = useState(false);

  const { data: entitlement } = useEntitlement();
  const sync = useSyncBilling();
  const isFramePlus = entitlement?.plan === "frame_plus";

  const compQuery = useActiveCompetition();
  const pressure = compQuery.data?.pressure ?? null;
  const hasActiveCompetition = !!compQuery.data?.competition;

  async function handleRestore() {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      await sync.mutateAsync();
      void Haptics.notificationAsync(
        hasFramePlus(info)
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRestoring(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const {
    data: rawFacts,
    isLoading: factsLoading,
    isFetching: factsFetching,
    refetch: refetchFacts,
  } = useQuery<ModelFact[]>({
    queryKey: ["memory"],
    queryFn: () =>
      apiGet<{ facts: ModelFact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const facts: ModelFact[] = Array.isArray(rawFacts) ? rawFacts : [];
  const activeFacts = facts.filter((f) => f.status === "active");

  const grouped = CATEGORY_ORDER.reduce<Record<string, ModelFact[]>>((acc, cat) => {
    const items = activeFacts.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const model = useMemo(
    () =>
      computeAthleteModel({
        facts: activeFacts,
        fighterLevel: fighter?.level,
        fighterCreatedAt: fighter?.createdAt,
        hasActiveCompetition,
      }),
    [activeFacts, fighter?.level, fighter?.createdAt, hasActiveCompetition],
  );

  const frameState = useMemo(
    () => deriveFrameState(activeFacts, !!fighter),
    [activeFacts, fighter],
  );

  const focus = fighter ? primaryFocus(fighter, activeFacts) : null;
  const arch = getArchetype(fighter?.spiritAnimal);
  const comp = pressure
    ? { value: `${pressure.daysToEvent}D · ${pressure.tierLabel.toUpperCase()}`, sub: pressure.competition.eventName }
    : { value: "NONE SCHEDULED", sub: undefined as string | undefined };

  const isLoading = fighterLoading || factsLoading;

  function handleRefresh() {
    refetch();
    refetchFacts();
    compQuery.refetch();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  function requestAiWithdrawal() {
    Alert.alert(
      "Withdraw AI permission?",
      "FRAME will pause coaching, analysis, planning, and other authenticated features until you review and accept the current AI disclosure again. Your existing account data will remain until you delete it or your account.",
      [
        { text: "Keep permission", style: "cancel" },
        {
          text: "Withdraw permission",
          style: "destructive",
          onPress: async () => {
            setWithdrawingAi(true);
            try {
              const status = await apiPatch<AiConsentStatus>("/ai-consent", {
                accepted: false,
              });
              qc.setQueryData(["ai-consent"], status);
            } catch (error) {
              Alert.alert(
                "Permission not changed",
                error instanceof Error ? error.message : "Please try again.",
              );
            } finally {
              setWithdrawingAi(false);
            }
          },
        },
      ],
    );
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    try {
      await apiDelete<{ deleted: true }>("/account");
      await signOut();
      router.replace("/sign-in");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Account deleted",
        "Your FRAME account and training data have been permanently deleted.",
      );
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not delete account",
        error instanceof Error
          ? error.message
          : "Your account was not deleted. Please try again.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  function requestAccountDeletion() {
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
              "This cannot be undone. If you have an active FRAME+ subscription, cancel it separately in your App Store account settings.",
              [
                { text: "Keep account", style: "cancel" },
                {
                  text: "Delete account",
                  style: "destructive",
                  onPress: () => void deleteAccount(),
                },
              ],
            );
          },
        },
      ],
    );
  }

  if (isLoading && !fighter) {
    return (
      <Screen>
        <View style={[s.root, { paddingTop: topPad }]}>
          <ActivityIndicator color={ACCENT} style={{ marginTop: 60 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen photo={media.gym}>
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: topPad + 12, paddingBottom: bottomPad + 32 }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={ACCENT} />
      }
    >
      {/* PASSPORT HEADER */}
      <View style={s.passportHead}>
        <Eyebrow style={s.passportKicker}>ATHLETE</Eyebrow>
        <Display size="title" style={s.passportTitle}>Passport</Display>
      </View>

      {!fighter ? (
        <Text style={s.emptyState}>No athlete profile yet.</Text>
      ) : (
        <>
          {/* IDENTITY BAND + cover photo (site leads with this) */}
          <FadeIn style={s.identityWrap}>
            <IdentityBand
              fighter={fighter}
              subtitle={
                arch
                  ? `${arch.name} · ${model.coachingMode.label}`
                  : fighter.archetype ?? null
              }
            />
            <Pressable
              onPress={() => setEditVisible(true)}
              style={s.editFab}
              hitSlop={10}
              accessibilityLabel="Edit profile"
            >
              <Feather name="edit-2" size={16} color={palette.text} />
            </Pressable>
          </FadeIn>

          {/* BJJ rank is shown only to BJJ athletes. */}
          {fighter.level && isBjjSport(fighter.primarySport) ? (
            <View style={s.beltCard}>
              <Belt level={fighter.level} showMeaning />
            </View>
          ) : null}

          {/* ─── 1. ATHLETE MODEL — WHAT FRAME KNOWS ─────────────── */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionOverline}>ATHLETE MODEL</Text>
            <Text style={s.sectionTitle}>What FRAME knows</Text>
          </View>

          <View style={s.panel}>
            <View style={s.panelPad}>
              <View style={s.headRow}>
                <SectionHead overline="DOSSIER · MODEL CONFIDENCE" title="Understanding your game" />
                {factsFetching ? <Text style={s.syncing}>SYNCING</Text> : null}
              </View>

              <View style={s.gaugeRow}>
                <ArcGauge
                  value={model.frameConfidence}
                  size={220}
                  display={`${model.frameConfidence}%`}
                  label="Model confidence"
                />
              </View>

              {model.lastUpdated ? (
                <Text style={s.updated}>Updated {formatHeartbeat(model.lastUpdated)}</Text>
              ) : null}

              <View style={s.stageRow}>
                <Text style={s.stageLabel}>STAGE</Text>
                <Text style={s.stageValue}>{model.maturity.stage.label.toUpperCase()}</Text>
              </View>

              <Text style={s.bodyCopy}>{confidenceCopy(model.frameConfidence)}</Text>
            </View>

            {model.lowestCategories.length > 0 && (
              <View style={s.panelDivided}>
                <Text style={s.subOverline}>LOWEST CONFIDENCE</Text>
                {model.lowestCategories.map((c) => (
                  <View key={c} style={s.bulletRow}>
                    <View style={s.bulletDot} />
                    <Text style={s.bulletText}>{(CATEGORY_LABELS[c] ?? c).toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable style={s.ctaRow} onPress={() => router.push("/(tabs)/chat")}>
              <Text style={s.ctaText}>CONTINUE CALIBRATION</Text>
              <Feather name="arrow-right" size={13} color={ACCENT} />
            </Pressable>
          </View>

          {/* ─── 2. ATHLETE STATE — REAL SIGNAL ONLY ─────────────── */}
          <View style={s.panel}>
            <View style={s.stateTop}>
              <Text style={s.stateTopLabel}>ATHLETE STATE</Text>
              <Text style={s.stateTopAside}>REAL SIGNAL ONLY</Text>
            </View>
            <View style={s.rowDivided}>
              <DataRow label="STATE" value={frameState.label.toUpperCase()} sub={frameState.source} />
              <DataRow
                label="COACHING MODE"
                value={model.coachingMode.label.toUpperCase()}
                sub={model.coachingMode.focus}
              />
              <DataRow label="COMPETITION" value={comp.value} sub={comp.sub} />
              {focus ? <DataRow label="PRIMARY FOCUS" value={focus.label.toUpperCase()} sub={focus.source} /> : null}
            </View>
          </View>

          {/* ─── 3. MODEL COVERAGE — ATHLETE DNA ─────────────────── */}
          <View style={s.panel}>
            <View style={s.panelPad}>
              <SectionHead overline="MODEL COVERAGE" title="Athlete DNA" />
            </View>
            {isFramePlus ? (
              <View style={s.radarWrap}>
                <RadarChart dims={model.radarData} />
                <Text style={s.radarCaption}>
                  Confidence bands — how well FRAME understands each dimension. Not scored 1–100.
                </Text>
              </View>
            ) : (
              <LockedBody
                note="The DNA radar — how well FRAME reads each dimension of your game — is part of the full athlete model."
                onTap={() => router.push("/paywall")}
              />
            )}
          </View>

          {/* ─── 4. DERIVED READ — ATHLETE IDENTITY ──────────────── */}
          <View style={s.panel}>
            <View style={s.panelPad}>
              <SectionHead overline="DERIVED READ" title="Athlete identity" />
            </View>
            <View style={s.rowDivided}>
              <DataRow
                label="CURRENT STYLE"
                value={`${(fighter.primarySport ?? fighter.art ?? "—")} · ${fighter.level ?? "—"}`.toUpperCase()}
              />
              {arch && (
                <>
                  <DataRow label="PRIMARY ARCHETYPE" value={arch.name.toUpperCase()} />
                  <DataRow label="PRESSURE RESPONSE" value={leadClause(arch.pressureSignature)} />
                  <DataRow label="GIFT" value={leadClause(arch.gift)} />
                  <DataRow label="SHADOW" value={leadClause(arch.shadow)} />
                </>
              )}
              <DataRow
                label="COACHING MODE"
                value={model.coachingMode.label.toUpperCase()}
                sub={model.coachingMode.focus}
              />
              {model.topWeakness && (
                <DataRow
                  label="OBSERVED BLIND SPOT"
                  value={(model.topWeakness.topic || model.topWeakness.content).toUpperCase()}
                  sub={`conf ${model.topWeakness.confidence}/5`}
                />
              )}
            </View>

            {/* INTEGRITY / CADENCE / DAYS IN FRAME strip */}
            <View style={s.tripleStrip}>
              <View style={s.tripleCell}>
                <Text style={s.tripleLabel}>INTEGRITY</Text>
                <Text style={s.tripleValue}>{model.integrityLabel.toUpperCase()}</Text>
              </View>
              <View style={[s.tripleCell, s.tripleBorder]}>
                <Text style={s.tripleLabel}>CADENCE</Text>
                <Text style={s.tripleValue}>{(fighter.trainingFrequency ?? "—").toUpperCase()}</Text>
              </View>
              <View style={[s.tripleCell, s.tripleBorder]}>
                <Text style={s.tripleLabel}>DAYS IN FRAME</Text>
                <Text style={s.tripleValue}>{model.sinceDays}</Text>
              </View>
            </View>
            <View style={s.integrityBarWrap}>
              <View style={s.integrityBar}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={[s.integritySeg, i < model.integritySegments ? s.integrityOn : s.integrityOff]}
                  />
                ))}
              </View>
              <Text style={s.integrityCaption}>
                Frame integrity — how much of your structure survives when pressure spikes. Composure
                under fragmentation, not a fitness score.
              </Text>
            </View>
          </View>

          {/* ─── 5. FULL MODEL — N OBSERVATIONS ──────────────────── */}
          <View style={s.sectionHeaderRow}>
            <View>
              <Text style={s.sectionOverline}>FULL MODEL</Text>
              <Text style={s.sectionTitle}>
                {activeFacts.length} observation{activeFacts.length === 1 ? "" : "s"}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/history")} hitSlop={8}>
              <Text style={s.viewHistory}>VIEW HISTORY →</Text>
            </Pressable>
          </View>

          {!isFramePlus ? (
            <View style={s.panel}>
              <LockedBody
                note={
                  activeFacts.length === 0
                    ? "FRAME records durable observations as you train and talk. The full model is a FRAME+ feature."
                    : `FRAME holds ${activeFacts.length} recorded observation${activeFacts.length === 1 ? "" : "s"} on you. The full breakdown is a FRAME+ feature.`
                }
                onTap={() => router.push("/paywall")}
              />
            </View>
          ) : activeFacts.length === 0 ? (
            <View style={[s.panel, s.panelPad]}>
              <Text style={s.bodyCopy}>
                The model sharpens with use. As you talk to the coach, FRAME records durable
                observations and feeds them back into how you're coached.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 20 }}>
              {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
                <View key={c}>
                  <View style={s.catHeadRow}>
                    <Text style={s.catHeadLabel}>{(CATEGORY_LABELS[c] ?? c).toUpperCase()}</Text>
                    <View style={s.catHeadLine} />
                    <Text style={s.catHeadCount}>{grouped[c]!.length}</Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    {grouped[c]!.map((f) => (
                      <View key={f.id} style={s.factItem}>
                        <Text style={s.factText} numberOfLines={2}>
                          {(f.topic || f.content).toUpperCase()}
                        </Text>
                        <View style={s.factMeta}>
                          {(f.evidenceCount ?? 1) > 1 && (
                            <Text style={s.factEvidence}>×{f.evidenceCount}</Text>
                          )}
                          <FactConfidence value={f.confidence} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* MEMBERSHIP */}
          <View style={[s.section, { marginTop: 32 }]}>
            {isFramePlus ? (
              <View style={s.memberRow}>
                <Feather name="award" size={14} color={ACCENT} style={{ marginRight: 8 }} />
                <Text style={s.memberText}>FRAME+ ACTIVE</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [s.upgradeCard, pressed && s.pressed]}
                onPress={() => router.push("/paywall")}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.upgradeTitle}>FRAME+</Text>
                  <Text style={s.upgradeSub}>
                    Unlimited coaching · full history · full mission · subscribe in the iOS app
                  </Text>
                </View>
                <Feather name="arrow-right" size={14} color={ACCENT} />
              </Pressable>
            )}
            <Pressable style={s.restoreLink} onPress={handleRestore} disabled={restoring}>
              {restoring ? (
                <ActivityIndicator color={palette.textMid} size="small" />
              ) : (
                <Text style={s.restoreLinkText}>RESTORE PURCHASES</Text>
              )}
            </Pressable>
          </View>

          {/* ACCOUNT */}
          <View style={s.section}>
            <Text style={s.privacyHeading}>AI COACHING & PRIVACY</Text>
            <Text style={s.privacyCopy}>
              FRAME uses AI coaching services. Depending on the feature, FRAME may share the exact categories shown in the permission disclosure with Anthropic (Claude) or OpenAI. FRAME provides performance coaching, not medical advice or diagnosis.
            </Text>
            <Pressable
              style={s.privacyLink}
              onPress={() => void Linking.openURL(apiUrl("/privacy"))}
              accessibilityRole="link"
            >
              <Text style={s.privacyLinkText}>PRIVACY POLICY</Text>
              <Feather name="external-link" size={13} color={ACCENT} />
            </Pressable>
            <Pressable
              style={s.privacyLink}
              onPress={() => void Linking.openURL(apiUrl("/support"))}
              accessibilityRole="link"
            >
              <Text style={s.privacyLinkText}>SUPPORT</Text>
              <Feather name="external-link" size={13} color={ACCENT} />
            </Pressable>
            <Pressable
              style={s.privacyLink}
              onPress={() =>
                void Linking.openURL("https://apps.apple.com/account/subscriptions")
              }
              accessibilityRole="link"
              accessibilityLabel="Manage App Store subscriptions"
            >
              <Text style={s.privacyLinkText}>MANAGE APP STORE SUBSCRIPTION</Text>
              <Feather name="external-link" size={13} color={ACCENT} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.withdrawAiBtn,
                (withdrawingAi || deletingAccount) && s.disabled,
                pressed && s.pressed,
              ]}
              onPress={requestAiWithdrawal}
              disabled={withdrawingAi || deletingAccount}
              accessibilityRole="button"
              accessibilityLabel="Withdraw AI permission"
            >
              {withdrawingAi ? (
                <ActivityIndicator size="small" color={palette.textMid} />
              ) : (
                <Text style={s.withdrawAiText}>WITHDRAW AI PERMISSION</Text>
              )}
            </Pressable>
            <Pressable
              style={s.privacyLink}
              onPress={() => void Linking.openURL(apiUrl("/terms"))}
              accessibilityRole="link"
            >
              <Text style={s.privacyLinkText}>TERMS OF SERVICE</Text>
              <Feather name="external-link" size={13} color={ACCENT} />
            </Pressable>
            {email ? <Text style={s.emailText}>{email}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                s.signOutBtn,
                deletingAccount && s.disabled,
                pressed && s.pressed,
              ]}
              onPress={handleSignOut}
              disabled={deletingAccount}
            >
              <Feather name="log-out" size={14} color={palette.textMid} style={{ marginRight: 6 }} />
              <Text style={s.signOutText}>SIGN OUT</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.deleteAccountBtn,
                deletingAccount && s.disabled,
                pressed && s.pressed,
              ]}
              onPress={requestAccountDeletion}
              disabled={deletingAccount}
              accessibilityRole="button"
              accessibilityLabel="Delete account permanently"
            >
              {deletingAccount ? (
                <ActivityIndicator size="small" color={palette.redLight} />
              ) : (
                <>
                  <Feather name="trash-2" size={14} color={palette.redLight} style={{ marginRight: 6 }} />
                  <Text style={s.deleteAccountText}>DELETE ACCOUNT</Text>
                </>
              )}
            </Pressable>
            <Text style={s.deleteAccountNote}>
              Permanently removes your active FRAME account data. App Store purchase records and subscription cancellation remain managed by Apple.
            </Text>
          </View>

          <ProfileEditModal
            visible={editVisible}
            fighter={fighter}
            onClose={() => setEditVisible(false)}
          />
        </>
      )}
    </ScrollView>
    </Screen>
  );
}

const cd = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  row: { flexDirection: "row", gap: 3 },
  pip: { width: 3, height: 10, borderRadius: 2 },
  active: { backgroundColor: palette.goldLight },
  inactive: { backgroundColor: "rgba(255,255,255,0.1)" },
  count: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.5, color: palette.textLow },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: 20 },
  section: { marginBottom: 32 },
  privacyHeading: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textMid, marginBottom: 10 },
  privacyCopy: { fontFamily: fonts.text, fontSize: 13, lineHeight: 20, color: palette.textMid, marginBottom: 12 },
  privacyLink: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  privacyLinkText: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.5, color: palette.goldLight },
  emptyState: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.textLow,
    textAlign: "center",
    paddingVertical: 48,
  },

  // Passport header
  passportHead: { alignItems: "center", marginBottom: 18, gap: 2 },
  passportKicker: { color: palette.goldLight },
  passportTitle: { textAlign: "center" },

  // Identity band
  identityWrap: { position: "relative", marginBottom: 16 },
  band: {
    minHeight: 230,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: palette.graphite1,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bandControls: { position: "absolute", top: 10, right: 10, flexDirection: "row", gap: 6, zIndex: 10 },
  bandBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: "rgba(5,5,5,0.55)",
  },
  bandBody: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 16 },
  bandKicker: { color: palette.goldLight, marginBottom: 4 },
  bandName: { fontSize: 50, lineHeight: 48, color: palette.textHi },
  bandArchetype: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.4, color: palette.goldLight, marginTop: 8 },
  bandError: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: palette.redLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  editFab: {
    position: "absolute",
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: "rgba(5,5,5,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Belt
  beltCard: {
    borderWidth: 1,
    borderColor: palette.glassEdge,
    borderRadius: radius.lg,
    backgroundColor: palette.graphite1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 24,
    ...shadow.card,
  },

  // Big editorial section header (numbered sections 1 & 5)
  sectionHeader: { marginBottom: 16 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 16,
  },
  sectionOverline: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textLow, marginBottom: 6 },
  sectionTitle: { fontFamily: fonts.displayThin, fontSize: 20, lineHeight: 25, color: palette.textHi },
  viewHistory: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.8, color: palette.textLow },

  // Panel shell
  panel: {
    borderWidth: 1,
    borderColor: palette.glassEdge,
    borderRadius: radius.lg,
    backgroundColor: palette.graphite1,
    marginBottom: 20,
    overflow: "hidden",
    ...shadow.card,
  },
  panelPad: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  panelDivided: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },

  // Section head (overline + title, inside panels)
  headBlock: {},
  headOverline: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textLow, marginBottom: 8 },
  headTitle: { fontFamily: fonts.displayThin, fontSize: 15, lineHeight: 19, color: palette.textHi },
  headRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  syncing: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.goldLight },

  // Model confidence
  gaugeRow: { alignItems: "center", marginTop: 12, marginBottom: 4 },
  updated: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.5, color: palette.textLow, marginBottom: 16 },
  stageRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 },
  stageLabel: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textMid },
  stageValue: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.8, color: palette.goldLight },
    bodyCopy: { fontFamily: fonts.text, fontSize: 13, lineHeight: 20, color: palette.textMid, marginTop: 16 },

  // Lowest confidence bullets
  subOverline: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textLow, marginBottom: 12 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.goldLight },
  bulletText: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.8, color: palette.textMid },

  // CTA row
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  ctaText: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.8, color: palette.goldLight },

  // Athlete state top
  stateTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  stateTopLabel: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.8, color: palette.goldLight },
  stateTopAside: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textMid },

  // Data rows
  rowDivided: {},
  dataRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  dataLabel: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.4, color: palette.textMid, width: 112, paddingTop: 2 },
  dataValueWrap: { flex: 1, alignItems: "flex-end" },
  dataValue: { fontFamily: fonts.textMedium, fontSize: 13, letterSpacing: 0.6, color: palette.textHi, textAlign: "right" },
  dataSub: { fontFamily: fonts.text, fontSize: 12, color: palette.textMid, marginTop: 3, textAlign: "right" },

  // Locked FRAME+ body
  lockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  lockNote: { flex: 1, fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: palette.textMid },
  lockBadge: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.goldLight },

  // Radar
  radarWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  radarCaption: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: palette.textLow, textAlign: "center", marginTop: 8 },

  // Integrity triple strip
  tripleStrip: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  tripleCell: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, alignItems: "center" },
  tripleBorder: { borderLeftWidth: 1, borderLeftColor: palette.hairline },
  tripleLabel: { fontFamily: fonts.textMedium, fontSize: 11.5, letterSpacing: 1.8, color: palette.textMid, marginBottom: 5 },
  tripleValue: { fontFamily: fonts.numeral, fontSize: 18, letterSpacing: 0, color: palette.textHi, textAlign: "center" },
  integrityBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  integrityBar: { flexDirection: "row", gap: 4 },
  integritySeg: { height: 4, flex: 1, borderRadius: 2 },
  integrityOn: { backgroundColor: ACCENT },
  integrityOff: { backgroundColor: "rgba(255,244,224,0.14)" },
  integrityCaption: { fontFamily: fonts.text, fontSize: 11, lineHeight: 16, color: palette.textMid, marginTop: 10 },

  // Full model fact list
  catHeadRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  catHeadLabel: { fontFamily: fonts.textMedium, fontSize: 12, letterSpacing: 1.6, color: palette.goldLight },
  catHeadLine: { flex: 1, height: 1, backgroundColor: palette.goldHair },
  catHeadCount: { fontFamily: fonts.textMedium, fontSize: 11.5, color: palette.textLow },
  factItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 14,
    paddingVertical: 4,
    borderLeftWidth: 1,
    borderLeftColor: palette.goldHair,
  },
  factText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 12, letterSpacing: 0.8, color: palette.text },
  factMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  factEvidence: { fontFamily: fonts.textMedium, fontSize: 11.5, color: palette.goldLight },

  // Membership
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
    paddingHorizontal: 20,
  },
  memberText: { fontFamily: fonts.textMedium, fontSize: 11, color: palette.goldLight, letterSpacing: 1.8 },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.goldHair,
    borderRadius: radius.lg,
    backgroundColor: palette.goldWash,
    paddingVertical: 18,
    paddingHorizontal: 20,
    minHeight: 64,
  },
  upgradeTitle: { fontFamily: fonts.displayThin, fontSize: 17, lineHeight: 21, color: palette.goldPale },
  upgradeSub: { fontFamily: fonts.text, fontSize: 12.5, color: palette.textMid, marginTop: 6, lineHeight: 18 },
  restoreLink: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  restoreLinkText: { fontFamily: fonts.textMedium, fontSize: 11.5, color: palette.textLow, letterSpacing: 1.8 },

  // Account
  emailText: { fontFamily: fonts.text, fontSize: 13, color: palette.textLow, marginBottom: 12, textAlign: "center" },
  withdrawAiBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.glassEdge,
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  withdrawAiText: {
    fontFamily: fonts.textMedium,
    fontSize: 11.5,
    color: palette.textMid,
    letterSpacing: 1.8,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.glassEdge,
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
  },
  signOutText: { fontFamily: fonts.textMedium, fontSize: 11, color: palette.textLow, letterSpacing: 1.8 },
  deleteAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(224,86,78,0.35)",
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  deleteAccountText: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    color: palette.redLight,
    letterSpacing: 1.8,
  },
  deleteAccountNote: {
    fontFamily: fonts.text,
    fontSize: 11,
    color: palette.textLow,
    textAlign: "center",
    marginTop: 8,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
