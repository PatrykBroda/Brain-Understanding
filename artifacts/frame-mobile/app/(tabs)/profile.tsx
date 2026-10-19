import { useRouter } from "expo-router";
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
import {
  ArcGauge,
  Button,
  Display,
  EmptyState,
  FadeIn,
  GlassCard,
  IconButton,
  Label,
  Screen,
  Status,
  haptic,
} from "@/components/ui";
import { fonts, MIN_TAP, palette, radius, SCREEN_PAD, type as T } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useFighter, type Fighter } from "@/context/FighterContext";
import { apiDelete, apiGet, apiPatch, apiUrl, getAuthToken, heroFileUrl, uploadHero, removeHero } from "@/lib/api";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { primaryFocus } from "@/lib/primaryFocus";
import { observationPrompt } from "@/lib/factHistory";
import { externalLinks } from "@/lib/links";
import { useActiveCompetition } from "@/hooks/useCompetition";
import { Belt } from "@/components/Belt";
import { FactConfidence } from "@/components/FactConfidence";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { AnswersSection } from "@/components/AnswersSection";
import { FormScroll } from "@/components/FormScroll";
import { isBjjSport, LEGACY_SPORTS, SPORTS } from "@/lib/fighterOptions";
import { useEntitlement, useSyncBilling } from "@/hooks/useEntitlement";
import { restorePurchases, hasFramePlus } from "@/lib/purchases";
import {
  ARCHETYPE_UNLOCK_UNDERSTANDING,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  computeAthleteModel,
  confidenceCopy,
  deriveFrameState,
  factSeenLabel,
  formatHeartbeat,
  getArchetype,
  leadClause,
  type ModelFact,
} from "@/lib/athleteModel";

// 12MB ceiling mirrors the web upload guard; base64 is ~4/3 the byte size.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Sentence case: "GUARD RETENTION" / "guard retention" -> "Guard retention". */
function sentence(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  if (!v) return "—";
  const lower = v === v.toUpperCase() ? v.toLowerCase() : v;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Display label for a sport key ("bjj" -> "BJJ", "muay_thai" -> "Muay Thai"). */
function sportLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return [...SPORTS, ...LEGACY_SPORTS].find((o) => o.key === key)?.label ?? sentence(key.replace(/_/g, " "));
}

// ─── Card with a sentence-case section title ──────────────────────────────────
function Section({
  title,
  aside,
  children,
  padding = 0,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  padding?: number;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Display size="heading">{title}</Display>
        {aside}
      </View>
      <GlassCard padding={padding}>{children}</GlassCard>
    </View>
  );
}

// ─── Label / value row with hairline separator ────────────────────────────────
function DataRow({ label, value, sub, first }: { label: string; value: string; sub?: string; first?: boolean }) {
  return (
    <View style={[s.dataRow, !first && s.rowRule]}>
      <Text style={s.dataLabel}>{label}</Text>
      <View style={s.dataValueWrap}>
        <Text style={s.dataValue}>
          {value}
        </Text>
        {sub ? (
          <Text style={s.dataSub}>
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
    <Pressable style={s.lockRow} onPress={onTap} accessibilityRole="button" accessibilityLabel={`${note} Upgrade to FRAME+`}>
      <Feather name="lock" size={16} color={palette.textLow} style={{ marginTop: 2 }} />
      <Text style={s.lockNote}>{note}</Text>
      <Status label="FRAME+" tone="gold" />
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
    <Svg viewBox="-18 0 226 190" width="100%" height={210} style={{ alignSelf: "center", maxWidth: 280 }}>
      {gridLevels.map((level) => (
        <Polygon
          key={level}
          points={angles.map((_, i) => {
            const p = pt(level, i);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(" ")}
          fill="none"
          stroke={palette.border}
          strokeWidth={1}
        />
      ))}
      {angles.map((_, i) => {
        const end = pt(1, i);
        return (
          <Line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke={palette.border} strokeWidth={1} />
        );
      })}
      <Path d={filledPath} fill="rgba(244,244,241,0.06)" stroke={palette.gold} strokeWidth={1.2} strokeLinejoin="round" />
      {filledPoints.map((p, i) => (
        <Circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={2.5} fill={palette.gold} />
      ))}
      {dims.map((d, i) => {
        const lp = pt(1.38, i);
        return (
          <SvgText
            key={i}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor="middle"
            fontSize={8.5}
            fontFamily={fonts.medium}
            fill={palette.textMid}
          >
            {sentence(d.label)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── Athlete context — name first; the athlete's own cover photo if they set one ─
function IdentityBand({
  fighter,
  subtitle,
  onEdit,
}: {
  fighter: Fighter;
  subtitle?: string | null;
  onEdit?: () => void;
}) {
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
      haptic.success();
      qc.invalidateQueries({ queryKey: ["fighter"] });
    },
    onError: (e) => {
      haptic.error();
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    },
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
    haptic.select();
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

  const identity = (
    <View style={s.bandBody}>
      <Text style={s.bandName} numberOfLines={2} accessibilityRole="header">
        {fighter.name}
      </Text>
      {subtitle ? <Text style={s.bandSub}>{subtitle}</Text> : null}
      <View style={s.chipRow}>
        {fighter.primarySport ? <Status label={sportLabel(fighter.primarySport)} /> : null}
        {fighter.level ? <Status label={fighter.level} /> : null}
        {fighter.trainingFrequency ? <Status label={fighter.trainingFrequency} /> : null}
      </View>
    </View>
  );

  return (
    <View>
      {heroSrc ? (
        <View style={s.band}>
          <Image
            source={{
              uri: heroSrc,
              ...(heroToken ? { headers: { Authorization: `Bearer ${heroToken}` } } : {}),
            }}
            style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: zoom }] }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["rgba(8,9,11,0.20)", "rgba(8,9,11,0.55)", "rgba(8,9,11,0.94)"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={s.bandControls}>
            <IconButton icon="trash-2" label="Remove cover photo" onPress={() => remove.mutate()} disabled={busy} />
            <IconButton icon="camera" label="Change cover photo" onPress={pickHero} disabled={busy} />
          </View>
          {identity}
        </View>
      ) : (
        <GlassCard padding={0}>
          {identity}
          <View style={s.coverRow}>
            <Pressable
              onPress={pickHero}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Add cover photo"
              style={({ pressed }) => [s.coverBtn, pressed && { backgroundColor: palette.raised }, busy && { opacity: 0.4 }]}
            >
              {busy ? <ActivityIndicator size="small" color={palette.textMid} /> : <Feather name="camera" size={16} color={palette.textMid} />}
              <Text style={s.coverText}>Add cover photo</Text>
            </Pressable>
          </View>
        </GlassCard>
      )}
      {uploadError ? <Text style={s.bandError}>{uploadError}</Text> : null}
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
      if (hasFramePlus(info)) haptic.success();
      else haptic.select();
    } catch {
      haptic.error();
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
    staleTime: 0,
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
    ? { value: `${pressure.daysToEvent} days · ${pressure.tierLabel}`, sub: pressure.competition.eventName }
    : { value: "None scheduled", sub: undefined as string | undefined };

  const isLoading = fighterLoading || factsLoading;

  function handleRefresh() {
    refetch();
    refetchFacts();
    compQuery.refetch();
    haptic.select();
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
      haptic.success();
      Alert.alert(
        "Account deleted",
        "Your FRAME account and training data have been permanently deleted.",
      );
    } catch (error) {
      haptic.error();
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
      <Screen light={null}>
        <View style={[s.root, { paddingTop: topPad + 12, paddingHorizontal: SCREEN_PAD }]}>
          <EmptyState kind="loading" title="Loading your profile" />
        </View>
      </Screen>
    );
  }

  const linkRows: { label: string; url: string; a11y?: string }[] = [
    ...externalLinks().map((l) => ({ label: l.label, url: l.url })),
    { label: "Privacy policy", url: apiUrl("/privacy") },
    { label: "Support", url: apiUrl("/support") },
    { label: "Terms of service", url: apiUrl("/terms") },
    { label: "Manage App Store subscription", url: "https://apps.apple.com/account/subscriptions", a11y: "Manage App Store subscriptions" },
  ];

  return (
    <Screen light="silver" focus="topRight">
    <FormScroll
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: topPad + 12, paddingBottom: bottomPad + 40 }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={palette.textMid} />
      }
    >
      {/* HEADER */}
      <View style={s.pageHead}>
        <Display size="title">Profile</Display>
        {fighter ? (
          <IconButton icon="edit-2" label="Edit profile" onPress={() => setEditVisible(true)} />
        ) : null}
      </View>

      {!fighter ? (
        <EmptyState
          kind="empty"
          icon="user"
          title="No athlete profile yet"
          body="Pull to refresh, or reload to check again."
          actionLabel="Reload"
          onAction={handleRefresh}
        />
      ) : (
        <>
          {/* 1. ATHLETE CONTEXT FIRST */}
          <FadeIn style={s.block}>
            <IdentityBand
              fighter={fighter}
              subtitle={arch ? `${arch.name} · ${model.coachingMode.label}` : fighter.archetype ?? null}
            />
          </FadeIn>

          {/* BJJ rank is shown only to BJJ athletes. */}
          {fighter.level && isBjjSport(fighter.primarySport) ? (
            <View style={s.block}>
              <GlassCard>
                <Belt level={fighter.level} showMeaning />
              </GlassCard>
            </View>
          ) : null}

          <Section title="Right now">
            <DataRow first label="State" value={sentence(frameState.label)} sub={frameState.source} />
            <DataRow label="Coaching mode" value={sentence(model.coachingMode.label)} sub={model.coachingMode.focus} />
            <DataRow label="Competition" value={comp.value} sub={comp.sub} />
            {focus ? <DataRow label="Primary focus" value={sentence(focus.label)} sub={focus.source} /> : null}
          </Section>

          {/* The onboarding questionnaire, editable any time (same fields and validation as onboarding) */}
          <AnswersSection fighter={fighter} />

          {/* 2. ATHLETE MODEL */}
          <Section
            title="What FRAME knows"
            aside={factsFetching ? <Text style={s.syncing}>Syncing</Text> : undefined}
            padding={20}
          >
            <View style={s.gaugeRow}>
              <ArcGauge
                value={model.frameConfidence}
                size={200}
                display={`${model.frameConfidence}%`}
                label="Model confidence"
              />
            </View>
            {model.lastUpdated ? (
              <Text style={s.updated}>Updated {formatHeartbeat(model.lastUpdated)}</Text>
            ) : null}
            <View style={s.stageRow}>
              <Text style={s.dataLabel}>Stage</Text>
              <Status label={sentence(model.maturity.stage.label)} tone="gold" />
            </View>
            <Text style={s.bodyCopy}>{confidenceCopy(model.frameConfidence)}</Text>

            {model.lowestCategories.length > 0 && (
              <View style={s.lowest}>
                <Label>Lowest confidence</Label>
                {model.lowestCategories.map((c) => (
                  <View key={c} style={s.bulletRow}>
                    <View style={s.bulletDot} />
                    <Text style={s.bulletText}>{CATEGORY_LABELS[c] ?? c}</Text>
                  </View>
                ))}
              </View>
            )}

            <Button
              title="Continue calibration"
              variant="secondary"
              onPress={() => router.push("/(tabs)/chat")}
              style={{ marginTop: 20 }}
            />
          </Section>

          {/* 3. DNA */}
          <Section title="Athlete DNA">
            {isFramePlus ? (
              <View style={s.radarWrap}>
                <RadarChart dims={model.radarData} />
                <Text style={s.radarCaption}>
                  Confidence bands: how well FRAME understands each dimension. Not scored 1–100.
                </Text>
              </View>
            ) : (
              <LockedBody
                note="The DNA radar, how well FRAME reads each dimension of your game, is part of the full athlete model."
                onTap={() => router.push("/paywall")}
              />
            )}
          </Section>

          {/* 4. DERIVED READ */}
          <Section title="Athlete identity">
            <DataRow
              first
              label="Current style"
              value={`${sportLabel(fighter.primarySport ?? fighter.art)} · ${fighter.level ?? "—"}`}
            />
            {arch ? (
              <>
                <DataRow label="Archetype" value={arch.name} />
                <DataRow label="Pressure response" value={leadClause(arch.pressureSignature)} />
              </>
            ) : (
              <DataRow
                label="Archetype"
                value="Not assigned yet"
                sub={`FRAME assigns one once it understands ${ARCHETYPE_UNLOCK_UNDERSTANDING}% of your game. Now ${model.frameConfidence}%.`}
              />
            )}
            {model.topWeakness && (
              <DataRow
                label="Observed blind spot"
                value={sentence(model.topWeakness.topic || model.topWeakness.content)}
                sub={`Confidence ${model.topWeakness.confidence} of 5`}
              />
            )}

            <View style={[s.tripleStrip, s.rowRule]}>
              <View style={s.tripleCell}>
                <Text style={s.tripleLabel}>Integrity</Text>
                <Text style={s.tripleValue}>{sentence(model.integrityLabel)}</Text>
              </View>
              <View style={[s.tripleCell, s.tripleBorder]}>
                <Text style={s.tripleLabel}>Cadence</Text>
                <Text style={s.tripleValue}>{fighter.trainingFrequency ?? "—"}</Text>
              </View>
              <View style={[s.tripleCell, s.tripleBorder]}>
                <Text style={s.tripleLabel}>Days in FRAME</Text>
                <Text style={s.tripleValue}>{model.sinceDays}</Text>
              </View>
            </View>
            <View style={[s.integrityBarWrap, s.rowRule]}>
              <View style={s.integrityBar}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View key={i} style={[s.integritySeg, i < model.integritySegments ? s.integrityOn : s.integrityOff]} />
                ))}
              </View>
              <Text style={s.integrityCaption}>
                Frame integrity: how much of your structure survives when pressure spikes. Composure under
                fragmentation, not a fitness score.
              </Text>
            </View>
          </Section>

          {/* 5. FULL MODEL */}
          <View style={s.section}>
            <View style={s.sectionHead}>
              <Display size="heading">
                {activeFacts.length} observation{activeFacts.length === 1 ? "" : "s"}
              </Display>
              <Pressable onPress={() => router.push("/history")} hitSlop={8} style={s.linkAside} accessibilityRole="link">
                <Text style={s.linkAsideText}>View history</Text>
              </Pressable>
            </View>

            {!isFramePlus ? (
              <GlassCard padding={0}>
                <LockedBody
                  note={
                    activeFacts.length === 0
                      ? "FRAME records durable observations as you train and talk. The full model is a FRAME+ feature."
                      : `FRAME holds ${activeFacts.length} recorded observation${activeFacts.length === 1 ? "" : "s"} on you. The full breakdown is a FRAME+ feature.`
                  }
                  onTap={() => router.push("/paywall")}
                />
              </GlassCard>
            ) : activeFacts.length === 0 ? (
              <EmptyState
                kind="empty"
                icon="message-circle"
                title="No observations yet"
                body="The model sharpens with use. As you talk to the coach, FRAME records durable observations and feeds them back into how you're coached."
                actionLabel="Talk to your coach"
                onAction={() => router.push("/(tabs)/chat")}
              />
            ) : (
              <View style={{ gap: 16 }}>
                {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
                  <GlassCard key={c} padding={0}>
                    <View style={s.catHeadRow}>
                      <Text style={s.catHeadLabel}>{CATEGORY_LABELS[c] ?? c}</Text>
                      <Text style={s.catHeadCount}>{grouped[c]!.length}</Text>
                    </View>
                    {grouped[c]!.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() =>
                          router.push({
                            pathname: "/(tabs)/chat",
                            params: { prefill: observationPrompt(f, CATEGORY_LABELS[c] ?? c), n: String(Date.now()) },
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${sentence(f.topic || f.content)}, ${factSeenLabel(f)}. Discuss this with your coach`}
                        style={({ pressed }) => [s.factItem, s.rowRule, pressed && { backgroundColor: palette.raised }]}
                      >
                        <Text style={s.factText}>{sentence(f.topic || f.content)}</Text>
                        <View style={s.factMeta}>
                          <Text style={s.factEvidence}>
                            {(f.evidenceCount ?? 1) > 1 ? `×${f.evidenceCount} · ` : ""}
                            {factSeenLabel(f)}
                          </Text>
                          <FactConfidence value={f.confidence} />
                        </View>
                      </Pressable>
                    ))}
                  </GlassCard>
                ))}
              </View>
            )}
          </View>

          {/* MEMBERSHIP */}
          <View style={s.section}>
            {isFramePlus ? (
              <GlassCard tone="gold" padding={16}>
                <View style={s.memberRow}>
                  <Feather name="award" size={18} color={palette.gold} />
                  <Text style={s.memberText}>FRAME+ active</Text>
                </View>
              </GlassCard>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upgrade to FRAME+"
                onPress={() => router.push("/paywall")}
                style={({ pressed }) => pressed && s.pressed}
              >
                <GlassCard tone="gold" padding={18}>
                  <View style={s.upgradeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.upgradeTitle}>FRAME+</Text>
                      <Text style={s.upgradeSub}>
                        Unlimited coaching, full history, full mission. Subscribe in the iOS app.
                      </Text>
                    </View>
                    <Feather name="arrow-right" size={18} color={palette.goldPale} />
                  </View>
                </GlassCard>
              </Pressable>
            )}
            <Button
              title="Restore purchases"
              variant="ghost"
              onPress={handleRestore}
              loading={restoring}
              style={{ marginTop: 8 }}
            />
          </View>

          {/* ACCOUNT, PRIVACY */}
          <Section title="AI coaching and privacy" padding={20}>
            <Text style={s.privacyCopy}>
              FRAME uses AI coaching services. Depending on the feature, FRAME may share the exact categories shown in the permission disclosure with Anthropic (Claude) or OpenAI. FRAME provides performance coaching, not medical advice or diagnosis.
            </Text>
            <View style={s.linkList}>
              {linkRows.map((l, i) => (
                <Pressable
                  key={l.label}
                  style={({ pressed }) => [s.linkRow, i > 0 && s.rowRule, pressed && { opacity: 0.7 }]}
                  onPress={() => void Linking.openURL(l.url)}
                  accessibilityRole="link"
                  accessibilityLabel={l.a11y ?? l.label}
                >
                  <Text style={s.linkText}>{l.label}</Text>
                  <Feather name="external-link" size={16} color={palette.textLow} />
                </Pressable>
              ))}
            </View>
            <Button
              title="Withdraw AI permission"
              variant="secondary"
              onPress={requestAiWithdrawal}
              disabled={withdrawingAi || deletingAccount}
              loading={withdrawingAi}
              accessibilityLabel="Withdraw AI permission"
              style={{ marginTop: 16 }}
            />
          </Section>

          <View style={s.section}>
            {email ? <Text style={s.emailText}>Signed in as {email}</Text> : null}
            <Button
              title="Sign out"
              variant="secondary"
              onPress={handleSignOut}
              disabled={deletingAccount}
            />
            <Button
              title="Delete account"
              variant="danger"
              onPress={requestAccountDeletion}
              loading={deletingAccount}
              accessibilityLabel="Delete account permanently"
              style={{ marginTop: 12 }}
            />
            <Text style={s.deleteAccountNote}>
              Permanently removes your active FRAME account data. App Store purchase records and subscription cancellation remain managed by Apple.
            </Text>
          </View>

          <ProfileEditModal visible={editVisible} fighter={fighter} onClose={() => setEditVisible(false)} />
        </>
      )}
    </FormScroll>
    </Screen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: SCREEN_PAD },
  pageHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  block: { marginBottom: 20 },
  section: { marginBottom: 28 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, minHeight: 26 },
  syncing: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  linkAside: { minHeight: MIN_TAP, justifyContent: "center", marginVertical: -9 },
  linkAsideText: { fontFamily: fonts.medium, fontSize: 14, color: palette.goldPale },

  // Identity band
  band: {
    minHeight: 240,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bandControls: { position: "absolute", top: 10, right: 10, flexDirection: "row", gap: 8, zIndex: 10 },
  bandBody: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, gap: 4 },
  bandName: { ...T.title, fontSize: 30, lineHeight: 36, color: palette.textHi },
  bandSub: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: palette.textMid },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  coverRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  coverBtn: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: MIN_TAP, paddingHorizontal: 20 },
  coverText: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  bandError: { fontFamily: fonts.regular, fontSize: 13, color: palette.redText, paddingHorizontal: 4, paddingTop: 10 },

  // Data rows
  dataRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  dataLabel: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid, width: 118, paddingTop: 1 },
  dataValueWrap: { flex: 1, alignItems: "flex-end" },
  dataValue: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: palette.textHi, textAlign: "right" },
  dataSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.textMid, marginTop: 3, textAlign: "right" },

  // Model confidence
  gaugeRow: { alignItems: "center", marginBottom: 4 },
  updated: { fontFamily: fonts.regular, fontSize: 13, color: palette.textLow, textAlign: "center", marginBottom: 16 },
  stageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  bodyCopy: { ...T.bodySm, color: palette.textMid, marginTop: 12 },
  lowest: { marginTop: 20, gap: 8 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.textLow },
  bulletText: { fontFamily: fonts.regular, fontSize: 15, color: palette.textHi },

  // Locked FRAME+ body
  lockRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingVertical: 18, minHeight: MIN_TAP },
  lockNote: { flex: 1, ...T.bodySm, color: palette.textMid },

  // Radar
  radarWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  radarCaption: { ...T.caption, color: palette.textLow, textAlign: "center", marginTop: 8 },

  // Integrity strip
  tripleStrip: { flexDirection: "row" },
  tripleCell: { flex: 1, paddingHorizontal: 8, paddingVertical: 14, alignItems: "center", gap: 4 },
  tripleBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.borderStrong },
  tripleLabel: { fontFamily: fonts.medium, fontSize: 12, color: palette.textMid, textAlign: "center" },
  tripleValue: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi, textAlign: "center", fontVariant: ["tabular-nums"] },
  integrityBarWrap: { paddingHorizontal: 20, paddingVertical: 16 },
  integrityBar: { flexDirection: "row", gap: 4 },
  integritySeg: { height: 4, flex: 1, borderRadius: 2 },
  integrityOn: { backgroundColor: palette.gold },
  integrityOff: { backgroundColor: palette.borderStrong },
  integrityCaption: { ...T.caption, color: palette.textMid, marginTop: 10 },

  // Full model fact list
  catHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  catHeadLabel: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi },
  catHeadCount: { fontFamily: fonts.medium, fontSize: 13, color: palette.textLow, fontVariant: ["tabular-nums"] },
  factItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  factText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: palette.textHi },
  factMeta: { alignItems: "flex-end", gap: 6 },
  factEvidence: { fontFamily: fonts.medium, fontSize: 12, color: palette.textMid, fontVariant: ["tabular-nums"] },

  // Membership
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center" },
  memberText: { fontFamily: fonts.semi, fontSize: 16, color: palette.goldPale },
  upgradeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  upgradeTitle: { ...T.heading, color: palette.goldPale },
  upgradeSub: { ...T.bodySm, color: palette.textMid, marginTop: 4 },

  // Account
  privacyCopy: { ...T.bodySm, color: palette.textMid },
  linkList: { marginTop: 12 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TAP + 4 },
  linkText: { fontFamily: fonts.medium, fontSize: 15, color: palette.textHi },
  emailText: { fontFamily: fonts.regular, fontSize: 13, color: palette.textLow, marginBottom: 12, textAlign: "center" },
  deleteAccountNote: { ...T.caption, color: palette.textLow, textAlign: "center", marginTop: 10 },
  pressed: { opacity: 0.8 },
});
