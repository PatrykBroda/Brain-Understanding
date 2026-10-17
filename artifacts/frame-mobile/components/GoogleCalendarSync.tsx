import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { Button, GlassCard } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { SESSION_TYPES, type SessionType } from "@/lib/competition";
import {
  localTimeZone,
  type GoogleImportItem,
} from "@/lib/google";
import {
  useGoogleStatus,
  useStartGoogleLink,
  useDisconnectGoogle,
  useGooglePreview,
  useGoogleApply,
} from "@/hooks/useGoogle";

const TYPE_LABEL: Record<SessionType, string> = {
  sparring: "Sparring",
  wrestling: "Wrestling",
  bjj: "BJJ",
  striking: "Striking",
  conditioning: "Conditioning",
  recovery: "Recovery",
  mobility: "Mobility",
};

function nextType(t: SessionType): SessionType {
  const i = SESSION_TYPES.indexOf(t);
  return SESSION_TYPES[(i + 1) % SESSION_TYPES.length];
}

type Draft = GoogleImportItem & { selected: boolean; sessionType: SessionType };

export function GoogleCalendarSync({ campId }: { campId: number }) {
  const tz = useMemo(() => localTimeZone(), []);

  const statusQ = useGoogleStatus();
  const startMut = useStartGoogleLink();
  const disconnectMut = useDisconnectGoogle();
  const previewMut = useGooglePreview();
  const applyMut = useGoogleApply();

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [pushManual, setPushManual] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const status = statusQ.data;

  async function connect() {
    setErr(null);
    setLinking(true);
    try {
      const { url } = await startMut.mutateAsync();
      await WebBrowser.openAuthSessionAsync(url);
      // The consent window redirects to the API callback page (not back into
      // the app), so we can't rely on a return URL — poll status after close.
      await statusQ.refetch();
      setTimeout(() => {
        statusQ.refetch().catch(() => {});
      }, 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start Google linking.");
    } finally {
      setLinking(false);
    }
  }

  async function disconnect() {
    setErr(null);
    setDrafts(null);
    try {
      await disconnectMut.mutateAsync();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not disconnect.");
    }
  }

  async function runPreview() {
    setErr(null);
    try {
      const { items } = await previewMut.mutateAsync({ campId, timeZone: tz });
      setDrafts(
        items.map((it) => ({
          ...it,
          selected: true,
          sessionType: it.suggestedType,
        }))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Preview failed.";
      setErr(needsReconnect(msg) ? "Google access expired — reconnect below." : msg);
    }
  }

  async function apply() {
    if (!drafts) return;
    setErr(null);
    const chosen = drafts.filter((d) => d.selected);
    try {
      await applyMut.mutateAsync({
        campId,
        timeZone: tz,
        importItems: chosen.map((d) => ({
          externalEventId: d.externalEventId,
          sessionType: d.sessionType,
          sessionDate: d.sessionDate,
          startTime: d.startTime,
          durationMin: d.durationMin,
          objective: d.title,
        })),
        exportSessions: pushManual,
      });
      setDrafts(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed.";
      setErr(needsReconnect(msg) ? "Google access expired — reconnect below." : msg);
    }
  }

  if (statusQ.isLoading || !status) {
    return (
      <GlassCard padding={20} style={styles.wrap}>
        <View style={styles.loadingRow} accessibilityLabel="Loading Google Calendar status">
          <ActivityIndicator color={palette.textMid} />
          <Text style={styles.sub}>Checking Google Calendar</Text>
        </View>
      </GlassCard>
    );
  }

  if (!status.configured) {
    return null; // Google linking not set up on this deployment.
  }

  return (
    <GlassCard padding={20} style={styles.wrap}>
      <View style={styles.col}>
        <View style={styles.headerRow}>
          <Feather name="calendar" size={18} color={palette.textMid} />
          <Text style={styles.title}>Google Calendar</Text>
        </View>

        {status.connected ? (
          <>
            <Text style={styles.sub}>
              {status.googleEmail ? `Linked as ${status.googleEmail}` : "Linked"}
              {status.lastSyncedAt ? ` · last synced ${new Date(status.lastSyncedAt).toLocaleDateString()}` : ""}
            </Text>

            <View style={styles.btnRow}>
              <Button
                title="Sync"
                variant="secondary"
                onPress={runPreview}
                loading={previewMut.isPending}
                style={styles.flex1}
              />
              <Button
                title="Disconnect"
                variant="ghost"
                onPress={disconnect}
                disabled={disconnectMut.isPending}
                style={styles.flex1}
              />
            </View>

            {drafts && (
              <View style={styles.previewWrap}>
                {drafts.length === 0 ? (
                  <Text style={styles.sub}>No new calendar events found in this camp window.</Text>
                ) : (
                  <>
                    <Text style={styles.previewHead}>
                      {drafts.filter((d) => d.selected).length} of {drafts.length} to import
                    </Text>
                    <View style={styles.eventList}>
                      {drafts.map((d, idx) => (
                        <View key={d.externalEventId} style={[styles.eventRow, idx > 0 && styles.rule]}>
                          <Pressable
                            onPress={() =>
                              setDrafts((prev) =>
                                prev ? prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)) : prev,
                              )
                            }
                            style={styles.checkHit}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`Import ${d.title}`}
                            accessibilityState={{ checked: d.selected }}
                          >
                            <View style={[styles.checkbox, d.selected && styles.checkboxOn]}>
                              {d.selected && <Feather name="check" size={14} color={palette.onGold} />}
                            </View>
                          </Pressable>
                          <View style={styles.eventBody}>
                            <Text style={styles.eventTitle} numberOfLines={1}>
                              {d.title}
                            </Text>
                            <Text style={styles.eventMeta}>
                              {d.sessionDate}
                              {d.startTime ? ` · ${d.startTime}` : ""}
                              {d.durationMin ? ` · ${d.durationMin}m` : ""}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() =>
                              setDrafts((prev) =>
                                prev
                                  ? prev.map((p, i) => (i === idx ? { ...p, sessionType: nextType(p.sessionType) } : p))
                                  : prev,
                              )
                            }
                            style={styles.typeChip}
                            accessibilityRole="button"
                            accessibilityLabel={`Session type ${TYPE_LABEL[d.sessionType]}, tap to change`}
                          >
                            <Text style={styles.typeText}>{TYPE_LABEL[d.sessionType]}</Text>
                            <Feather name="chevron-right" size={12} color={palette.textMid} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <Pressable
                  onPress={() => setPushManual((v) => !v)}
                  style={styles.toggleRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: pushManual }}
                >
                  <View style={styles.checkHit}>
                    <View style={[styles.checkbox, pushManual && styles.checkboxOn]}>
                      {pushManual && <Feather name="check" size={14} color={palette.onGold} />}
                    </View>
                  </View>
                  <Text style={styles.toggleText}>Also push my manual sessions to Google</Text>
                </Pressable>

                <View style={styles.btnRow}>
                  <Button title="Cancel" variant="secondary" onPress={() => setDrafts(null)} style={styles.flex1} />
                  <Button title="Apply" onPress={apply} loading={applyMut.isPending} style={styles.flex1} />
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sub}>
              Link your Google Calendar to import training events and push camp sessions both ways.
            </Text>
            <Button
              title="Connect Google Calendar"
              variant="secondary"
              onPress={connect}
              loading={linking || startMut.isPending}
            />
          </>
        )}

        {err && (
          <Text style={styles.err} accessibilityRole="alert">
            {err}
          </Text>
        )}
      </View>
    </GlassCard>
  );
}

function needsReconnect(msg: string): boolean {
  return /409|reconnect|invalid_grant|expired|revoked/i.test(msg);
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  col: { gap: 12 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontFamily: fonts.semi, fontSize: 17, lineHeight: 22, color: palette.textHi },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid },
  btnRow: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  previewWrap: { gap: 12, marginTop: 4 },
  previewHead: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, fontVariant: ["tabular-nums"] },
  eventList: { borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, overflow: "hidden" },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 8, minHeight: MIN_TAP + 8 },
  checkHit: { width: MIN_TAP, height: MIN_TAP, alignItems: "center", justifyContent: "center" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: palette.gold, borderColor: palette.gold },
  eventBody: { flex: 1, gap: 2, paddingVertical: 8 },
  eventTitle: { fontFamily: fonts.medium, fontSize: 15, color: palette.textHi },
  eventMeta: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid, fontVariant: ["tabular-nums"] },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    minHeight: MIN_TAP,
    paddingHorizontal: 12,
  },
  typeText: { fontFamily: fonts.medium, fontSize: 13, color: palette.textHi },
  toggleRow: { flexDirection: "row", alignItems: "center", minHeight: MIN_TAP },
  toggleText: { fontFamily: fonts.regular, fontSize: 14, color: palette.textHi, flex: 1 },
  err: { fontFamily: fonts.regular, fontSize: 14, color: palette.redText },
});
