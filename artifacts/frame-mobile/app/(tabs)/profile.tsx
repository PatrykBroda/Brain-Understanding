import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useFighter, type Fighter } from "@/context/FighterContext";
import { apiGet, heroFileUrl, uploadHero, removeHero } from "@/lib/api";
import { primaryFocus, primaryStrength } from "@/lib/primaryFocus";
import { Belt } from "@/components/Belt";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { useEntitlement, useSyncBilling } from "@/hooks/useEntitlement";
import { restorePurchases, hasFramePlus } from "@/lib/purchases";

interface Fact {
  id: number;
  category: string;
  content: string;
  confidence: number;
  status: string;
  source: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  strength: "STRENGTHS",
  weakness: "WEAKNESSES",
  technical_knowledge: "TECHNICAL KNOWLEDGE",
  pattern: "RECURRING PATTERNS",
  preference: "COACHING PREFERENCES",
  goal: "ACTIVE GOALS",
  event: "RECENT EVENTS",
  context: "LIFE CONTEXT",
};

const CATEGORY_ORDER = [
  "weakness",
  "strength",
  "goal",
  "technical_knowledge",
  "pattern",
  "preference",
  "event",
  "context",
];

// 12MB ceiling mirrors the web upload guard; base64 is ~4/3 the byte size.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function ConfidenceDots({ n }: { n: number }) {
  return (
    <View style={cd.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[cd.dot, i <= n ? cd.active : cd.inactive]} />
      ))}
    </View>
  );
}
const cd = StyleSheet.create({
  row: { flexDirection: "row", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  active: { backgroundColor: "#C9883A" },
  inactive: { backgroundColor: "#1a1a1a" },
});

function LineItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.lineItem}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={s.lineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ─── Hero identity band — the cover photo, changeable in place ────────────
function IdentityBand({ fighter }: { fighter: Fighter }) {
  const qc = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (payload: {
      mimeType: string;
      filename: string;
      dataBase64: string;
    }) => uploadHero<{ fighter: Fighter }>(payload),
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["fighter"] });
    },
    onError: (e) =>
      setUploadError(e instanceof Error ? e.message : "Upload failed"),
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
            style={[
              StyleSheet.absoluteFill,
              { opacity: 0.42, transform: [{ scale: zoom }] },
            ]}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={["rgba(201,136,58,0.14)", "rgba(0,0,0,0.4)"]}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={["rgba(10,10,10,0.35)", "rgba(10,10,10,0.55)", "#0a0a0a"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Cover-photo controls */}
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
              <ActivityIndicator size="small" color="#C9883A" />
            ) : (
              <Feather name="camera" size={14} color="#C9883A" />
            )}
          </Pressable>
        </View>

        <View style={s.bandBody}>
          <Text style={s.bandKicker}>IDENTITY</Text>
          <Text style={s.bandName} numberOfLines={1}>
            {fighter.name.toUpperCase()}
          </Text>
          {fighter.archetype ? (
            <Text style={s.bandArchetype}>{fighter.archetype.toUpperCase()}</Text>
          ) : null}
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
    refetch: refetchFacts,
  } = useQuery<Fact[]>({
    queryKey: ["memory"],
    queryFn: () =>
      apiGet<{ facts: Fact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const facts: Fact[] = Array.isArray(rawFacts) ? rawFacts : [];
  const activeFacts = facts.filter((f) => f.status === "active");

  const grouped = CATEGORY_ORDER.reduce<Record<string, Fact[]>>((acc, cat) => {
    const items = activeFacts.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const focus = fighter ? primaryFocus(fighter, activeFacts) : null;
  const strength = primaryStrength(activeFacts);

  const isLoading = fighterLoading || factsLoading;

  function handleRefresh() {
    refetch();
    refetchFacts();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  if (isLoading && !fighter) {
    return (
      <View style={[s.root, { paddingTop: topPad }]}>
        <ActivityIndicator color="#C9883A" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: topPad + 12, paddingBottom: bottomPad + 32 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor="#C9883A"
        />
      }
    >
      {/* PASSPORT HEADER */}
      <View style={s.passportHead}>
        <Text style={s.passportKicker}>ATHLETE</Text>
        <Text style={s.passportTitle}>PASSPORT</Text>
      </View>

      {/* IDENTITY BAND + cover photo */}
      {fighter && (
        <View style={s.identityWrap}>
          <IdentityBand fighter={fighter} />
          <Pressable
            onPress={() => setEditVisible(true)}
            style={s.editFab}
            hitSlop={10}
            accessibilityLabel="Edit profile"
          >
            <Feather name="edit-2" size={14} color="#888" />
          </Pressable>
        </View>
      )}

      {/* RANK — the belt IS the identity */}
      {fighter?.level ? (
        <View style={s.section}>
          <Belt level={fighter.level} showMeaning />
        </View>
      ) : null}

      {/* FOCUS · STRENGTH · Continue Calibration */}
      {fighter && (
        <View style={s.focusCard}>
          {focus && <LineItem label="FOCUS" value={focus.label} />}
          {strength && <LineItem label="STRENGTH" value={strength.label} />}
          <Pressable
            style={s.calibrateRow}
            onPress={() => router.push("/(tabs)/chat")}
          >
            <Text style={s.calibrateText}>CONTINUE CALIBRATION</Text>
            <Feather name="arrow-right" size={13} color="#C9883A" />
          </Pressable>
        </View>
      )}

      {/* COMPETITION MODE */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>COMPETITION MODE</Text>
        <Pressable
          style={({ pressed }) => [s.navBtn, pressed && s.pressed]}
          onPress={() => router.push("/(tabs)/planner")}
        >
          <Feather name="target" size={14} color="#C9883A" style={{ marginRight: 8 }} />
          <Text style={s.navBtnText}>OPEN CAMP</Text>
          <Feather name="chevron-right" size={14} color="#444" style={{ marginLeft: "auto" }} />
        </Pressable>
      </View>

      {/* ATHLETE MODEL */}
      {Object.keys(grouped).length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>ATHLETE MODEL</Text>
          {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((cat) => (
            <View key={cat} style={s.catBlock}>
              <Text style={s.catLabel}>{CATEGORY_LABELS[cat]}</Text>
              {grouped[cat]!.map((fact) => (
                <View key={fact.id} style={s.factRow}>
                  <ConfidenceDots n={fact.confidence} />
                  <Text style={s.factText}>{fact.content}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* MEMBERSHIP */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>MEMBERSHIP</Text>
        {isFramePlus ? (
          <View style={s.memberRow}>
            <Feather name="award" size={14} color="#C9883A" style={{ marginRight: 8 }} />
            <Text style={s.memberText}>FRAME+ ACTIVE</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [s.upgradeBtn, pressed && s.pressed]}
            onPress={() => router.push("/paywall")}
          >
            <Feather name="zap" size={14} color="#050505" style={{ marginRight: 8 }} />
            <Text style={s.upgradeText}>UPGRADE TO FRAME+</Text>
          </Pressable>
        )}
        <Pressable
          style={s.restoreLink}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator color="#666" size="small" />
          ) : (
            <Text style={s.restoreLinkText}>RESTORE PURCHASES</Text>
          )}
        </Pressable>
      </View>

      {/* ACCOUNT */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        {email ? <Text style={s.emailText}>{email}</Text> : null}
        <Pressable
          style={({ pressed }) => [s.signOutBtn, pressed && s.pressed]}
          onPress={handleSignOut}
        >
          <Feather name="log-out" size={14} color="#666" style={{ marginRight: 6 }} />
          <Text style={s.signOutText}>SIGN OUT</Text>
        </Pressable>
      </View>

      {fighter && (
        <ProfileEditModal
          visible={editVisible}
          fighter={fighter}
          onClose={() => setEditVisible(false)}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  content: { paddingHorizontal: 20 },
  section: { marginBottom: 32 },
  // Passport header
  passportHead: {
    alignItems: "center",
    marginBottom: 16,
  },
  passportKicker: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 5,
    color: "#666",
  },
  passportTitle: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 6,
    color: "#e0e0e0",
    marginTop: 4,
  },
  // Identity band
  identityWrap: {
    position: "relative",
    marginBottom: 24,
  },
  band: {
    minHeight: 190,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bandControls: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    gap: 6,
    zIndex: 10,
  },
  bandBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  bandBody: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 16,
  },
  bandKicker: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 6,
    color: "#888",
    marginBottom: 6,
  },
  bandName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 30,
    letterSpacing: 2,
    color: "#f2f2f2",
  },
  bandArchetype: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 4,
    color: "#C9883A",
    marginTop: 8,
  },
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
  // Focus/strength card
  focusCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 32,
  },
  lineItem: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  lineLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#777",
    width: 72,
  },
  lineValue: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#e0e0e0",
    textAlign: "right",
  },
  calibrateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  calibrateText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 4,
    color: "#C9883A",
  },
  // Sections
  sectionLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#444",
    letterSpacing: 3,
    marginBottom: 12,
  },
  catBlock: { marginBottom: 16 },
  catLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    color: "#555",
    letterSpacing: 2,
    marginBottom: 6,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  factText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#aaa",
    flex: 1,
    lineHeight: 18,
  },
  emailText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.7 },
  signOutText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#666",
    letterSpacing: 3,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#C9883A",
    letterSpacing: 3,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C9883A",
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  upgradeText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#050505",
    letterSpacing: 3,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C9883A",
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  memberText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#C9883A",
    letterSpacing: 3,
  },
  restoreLink: { alignItems: "center", paddingVertical: 14 },
  restoreLinkText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#555",
    letterSpacing: 3,
  },
});
