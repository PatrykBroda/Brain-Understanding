import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useAuth } from "@/context/AuthContext";
import { useFighter, type Fighter } from "@/context/FighterContext";
import { apiGet, heroFileUrl, uploadHero, removeHero } from "@/lib/api";
import { primaryFocus } from "@/lib/primaryFocus";
import { useActiveCompetition } from "@/hooks/useCompetition";
import { Belt } from "@/components/Belt";
import { ProfileEditModal } from "@/components/ProfileEditModal";
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

const ACCENT = "#8A6A2F";

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
const cd = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  row: { flexDirection: "row", gap: 3 },
  pip: { width: 3, height: 9 },
  active: { backgroundColor: "#d29a4d" },
  inactive: { backgroundColor: "rgba(255,255,255,0.1)" },
  count: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)" },
});

// ─── Segmented confidence bar (20 segments, matches web ConfidenceBar) ────────
function ConfidenceBar({ pct, segments = 20 }: { pct: number; segments?: number }) {
  const filled = Math.round((pct / 100) * segments);
  return (
    <View style={s.barRow}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={[
            s.barSeg,
            { backgroundColor: i < filled ? `hsl(32,54%,${50 - (i / segments) * 8}%)` : "rgba(255,255,255,0.08)" },
          ]}
        />
      ))}
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
      <Feather name="lock" size={14} color="rgba(255,255,255,0.4)" style={{ marginTop: 1 }} />
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
    <Svg viewBox="0 0 190 190" width="100%" height={200} style={{ alignSelf: "center", maxWidth: 220 }}>
      {gridLevels.map((level) => (
        <Polygon
          key={level}
          points={angles.map((_, i) => {
            const p = pt(level, i);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
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
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        );
      })}
      <Path d={filledPath} fill="rgba(138,106,47,0.12)" stroke="rgba(138,106,47,0.55)" strokeWidth={1.5} strokeLinejoin="round" />
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
            fontSize={7}
            fontFamily="SpaceMono"
            fill="rgba(255,255,255,0.45)"
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
            source={{ uri: heroSrc }}
            style={[StyleSheet.absoluteFill, { opacity: 0.42, transform: [{ scale: zoom }] }]}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={["rgba(138,106,47,0.14)", "rgba(0,0,0,0.4)"]}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={["rgba(10,10,10,0.35)", "rgba(10,10,10,0.55)", "#0a0a0a"]}
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
              <Feather name="trash-2" size={14} color="#bbb" />
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
              <Feather name="camera" size={14} color={ACCENT} />
            )}
          </Pressable>
        </View>

        <View style={s.bandBody}>
          <Text style={s.bandKicker}>IDENTITY</Text>
          <Text style={s.bandName} numberOfLines={1}>
            {fighter.name.toUpperCase()}
          </Text>
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
  const insets = useSafeAreaInsets();
  const [editVisible, setEditVisible] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  if (isLoading && !fighter) {
    return (
      <View style={[s.root, { paddingTop: topPad }]}>
        <ActivityIndicator color={ACCENT} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: topPad + 12, paddingBottom: bottomPad + 32 }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={ACCENT} />
      }
    >
      {/* PASSPORT HEADER */}
      <View style={s.passportHead}>
        <Text style={s.passportKicker}>ATHLETE</Text>
        <Text style={s.passportTitle}>PASSPORT</Text>
      </View>

      {!fighter ? (
        <Text style={s.emptyState}>No athlete profile yet.</Text>
      ) : (
        <>
          {/* IDENTITY BAND + cover photo (site leads with this) */}
          <View style={s.identityWrap}>
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
              <Feather name="edit-2" size={14} color="#888" />
            </Pressable>
          </View>

          {/* RANK — the belt IS the identity */}
          {fighter.level ? (
            <View style={s.beltCard}>
              <Belt level={fighter.level} showMeaning />
            </View>
          ) : null}

          {/* ─── 1. ATHLETE MODEL — WHAT FRAME KNOWS ─────────────── */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionOverline}>ATHLETE MODEL</Text>
            <Text style={s.sectionTitle}>WHAT FRAME KNOWS</Text>
          </View>

          <View style={s.panel}>
            <View style={s.panelPad}>
              <View style={s.headRow}>
                <SectionHead overline="DOSSIER · MODEL CONFIDENCE" title="UNDERSTANDING YOUR GAME" />
                {factsFetching ? <Text style={s.syncing}>SYNCING</Text> : null}
              </View>

              <View style={s.confRow}>
                <Text style={s.confBig}>
                  {model.frameConfidence}
                  <Text style={s.confPct}>%</Text>
                </Text>
                <Text style={s.confCaption}>MODEL{"\n"}CONFIDENCE</Text>
              </View>

              {model.lastUpdated ? (
                <Text style={s.updated}>Updated {formatHeartbeat(model.lastUpdated)}</Text>
              ) : null}

              <View style={s.stageRow}>
                <Text style={s.stageLabel}>STAGE</Text>
                <Text style={s.stageValue}>{model.maturity.stage.label.toUpperCase()}</Text>
              </View>

              <ConfidenceBar pct={model.frameConfidence} segments={20} />

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
              <SectionHead overline="MODEL COVERAGE" title="ATHLETE DNA" />
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
              <SectionHead overline="DERIVED READ" title="ATHLETE IDENTITY" />
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
                {activeFacts.length} OBSERVATION{activeFacts.length === 1 ? "" : "S"}
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
                <ActivityIndicator color="#666" size="small" />
              ) : (
                <Text style={s.restoreLinkText}>RESTORE PURCHASES</Text>
              )}
            </Pressable>
          </View>

          {/* ACCOUNT */}
          <View style={s.section}>
            {email ? <Text style={s.emailText}>{email}</Text> : null}
            <Pressable
              style={({ pressed }) => [s.signOutBtn, pressed && s.pressed]}
              onPress={handleSignOut}
            >
              <Feather name="log-out" size={14} color="#666" style={{ marginRight: 6 }} />
              <Text style={s.signOutText}>SIGN OUT</Text>
            </Pressable>
          </View>

          <ProfileEditModal
            visible={editVisible}
            fighter={fighter}
            onClose={() => setEditVisible(false)}
          />
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  content: { paddingHorizontal: 20 },
  section: { marginBottom: 32 },
  emptyState: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    paddingVertical: 48,
  },

  // Passport header
  passportHead: { alignItems: "center", marginBottom: 16 },
  passportKicker: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 5, color: "#666" },
  passportTitle: { fontFamily: "SpaceMono", fontSize: 13, letterSpacing: 6, color: "#e0e0e0", marginTop: 4 },

  // Identity band
  identityWrap: { position: "relative", marginBottom: 16 },
  band: {
    minHeight: 190,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bandControls: { position: "absolute", top: 10, right: 10, flexDirection: "row", gap: 6, zIndex: 10 },
  bandBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  bandBody: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 16 },
  bandKicker: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 6, color: "#888", marginBottom: 6 },
  bandName: { fontFamily: "Outfit_600SemiBold", fontSize: 30, letterSpacing: 2, color: "#f2f2f2" },
  bandArchetype: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 4, color: ACCENT, marginTop: 8 },
  bandError: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 1,
    color: "#d2553f",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editFab: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#222",
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Belt
  beltCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 32,
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
  sectionOverline: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 5, color: "rgba(255,255,255,0.45)", marginBottom: 6 },
  sectionTitle: { fontFamily: "Outfit", fontSize: 18, letterSpacing: 3, color: "rgba(255,255,255,0.9)" },
  viewHistory: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.45)" },

  // Panel shell
  panel: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.018)",
    marginBottom: 20,
    overflow: "hidden",
  },
  panelPad: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  panelDivided: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },

  // Section head (overline + title, inside panels)
  headBlock: {},
  headOverline: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.45)", marginBottom: 8 },
  headTitle: { fontFamily: "Outfit", fontSize: 15, letterSpacing: 3, color: "rgba(255,255,255,0.9)" },
  headRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  syncing: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: "rgba(138,106,47,0.6)" },

  // Model confidence
  confRow: { flexDirection: "row", alignItems: "baseline", gap: 14, marginTop: 24, marginBottom: 8 },
  confBig: { fontFamily: "Outfit", fontSize: 52, color: "rgba(255,255,255,0.95)", lineHeight: 52 },
  confPct: { fontSize: 24, color: "rgba(138,106,47,0.7)" },
  confCaption: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.5)", lineHeight: 14 },
  updated: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", marginBottom: 16 },
  stageRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 },
  stageLabel: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.5)" },
  stageValue: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 3, color: "rgba(138,106,47,0.85)" },
  barRow: { flexDirection: "row", gap: 2 },
  barSeg: { height: 3, flex: 1 },
  bodyCopy: { fontFamily: "Outfit", fontSize: 13, lineHeight: 20, color: "rgba(255,255,255,0.5)", marginTop: 16 },

  // Lowest confidence bullets
  subOverline: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 5, color: "rgba(255,255,255,0.4)", marginBottom: 12 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(138,106,47,0.4)" },
  bulletText: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.65)" },

  // CTA row
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  ctaText: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 4, color: "rgba(138,106,47,0.75)" },

  // Athlete state top
  stateTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  stateTopLabel: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 4, color: "rgba(138,106,47,0.85)" },
  stateTopAside: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 3, color: "rgba(255,255,255,0.5)" },

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
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  dataLabel: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.55)", width: 108, paddingTop: 1 },
  dataValueWrap: { flex: 1, alignItems: "flex-end" },
  dataValue: { fontFamily: "SpaceMono", fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.95)", textAlign: "right" },
  dataSub: { fontFamily: "SpaceMono", fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 3, textAlign: "right" },

  // Locked FRAME+ body
  lockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  lockNote: { flex: 1, fontFamily: "Outfit", fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.55)" },
  lockBadge: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: "rgba(138,106,47,0.8)" },

  // Radar
  radarWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  radarCaption: { fontFamily: "Outfit", fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 8 },

  // Integrity triple strip
  tripleStrip: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  tripleCell: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, alignItems: "center" },
  tripleBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.06)" },
  tripleLabel: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 2, color: "rgba(255,255,255,0.55)", marginBottom: 5 },
  tripleValue: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.95)", textAlign: "center" },
  integrityBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  integrityBar: { flexDirection: "row", gap: 4 },
  integritySeg: { height: 4, flex: 1 },
  integrityOn: { backgroundColor: ACCENT },
  integrityOff: { backgroundColor: "rgba(255,255,255,0.12)" },
  integrityCaption: { fontFamily: "Outfit", fontSize: 11, lineHeight: 16, color: "rgba(255,255,255,0.5)", marginTop: 10 },

  // Full model fact list
  catHeadRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  catHeadLabel: { fontFamily: "Outfit", fontSize: 13, letterSpacing: 3, color: "rgba(138,106,47,0.9)" },
  catHeadLine: { flex: 1, height: 1, backgroundColor: "rgba(138,106,47,0.22)" },
  catHeadCount: { fontFamily: "SpaceMono", fontSize: 9, color: "rgba(255,255,255,0.4)" },
  factItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 14,
    paddingVertical: 4,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(138,106,47,0.25)",
  },
  factText: { flex: 1, fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.75)" },
  factMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  factEvidence: { fontFamily: "SpaceMono", fontSize: 9, color: "rgba(138,106,47,0.7)" },

  // Membership
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: ACCENT,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  memberText: { fontFamily: "SpaceMono", fontSize: 10, color: ACCENT, letterSpacing: 3 },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  upgradeTitle: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.85)" },
  upgradeSub: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 1, color: "rgba(255,255,255,0.45)", marginTop: 6, lineHeight: 14 },
  restoreLink: { alignItems: "center", paddingVertical: 14 },
  restoreLinkText: { fontFamily: "SpaceMono", fontSize: 9, color: "#555", letterSpacing: 3 },

  // Account
  emailText: { fontFamily: "Outfit", fontSize: 13, color: "#666", marginBottom: 12, textAlign: "center" },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  signOutText: { fontFamily: "SpaceMono", fontSize: 10, color: "#666", letterSpacing: 3 },
  pressed: { opacity: 0.7 },
});
