import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
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
  const c = useColors();
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
      <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
        <ActivityIndicator color={c.mutedForeground} />
      </View>
    );
  }

  if (!status.configured) {
    return null; // Google linking not set up on this deployment.
  }

  return (
    <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={styles.headerRow}>
        <Feather name="calendar" size={15} color={c.primary} />
        <Text style={[styles.title, { color: c.foreground }]}>Google Calendar</Text>
      </View>

      {status.connected ? (
        <>
          <Text style={[styles.sub, { color: c.mutedForeground }]}>
            {status.googleEmail ? `Linked as ${status.googleEmail}` : "Linked"}
            {status.lastSyncedAt
              ? ` · last synced ${new Date(status.lastSyncedAt).toLocaleDateString()}`
              : ""}
          </Text>

          <View style={styles.btnRow}>
            <Pressable
              onPress={runPreview}
              disabled={previewMut.isPending}
              style={[styles.btn, { borderColor: c.primary }]}
            >
              {previewMut.isPending ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : (
                <>
                  <Feather name="refresh-cw" size={13} color={c.primary} />
                  <Text style={[styles.btnText, { color: c.primary }]}>Sync</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={disconnect}
              disabled={disconnectMut.isPending}
              style={[styles.btn, { borderColor: c.border }]}
            >
              <Text style={[styles.btnText, { color: c.mutedForeground }]}>
                Disconnect
              </Text>
            </Pressable>
          </View>

          {drafts && (
            <View style={styles.previewWrap}>
              {drafts.length === 0 ? (
                <Text style={[styles.sub, { color: c.mutedForeground }]}>
                  No new calendar events found in this camp window.
                </Text>
              ) : (
                <>
                  <Text style={[styles.previewHead, { color: c.mutedForeground }]}>
                    {drafts.filter((d) => d.selected).length} of {drafts.length} to import
                  </Text>
                  {drafts.map((d, idx) => (
                    <View
                      key={d.externalEventId}
                      style={[styles.eventRow, { borderColor: c.border }]}
                    >
                      <Pressable
                        onPress={() =>
                          setDrafts((prev) =>
                            prev
                              ? prev.map((p, i) =>
                                  i === idx ? { ...p, selected: !p.selected } : p
                                )
                              : prev
                          )
                        }
                        style={[
                          styles.checkbox,
                          {
                            borderColor: d.selected ? c.primary : c.border,
                            backgroundColor: d.selected ? c.primary : "transparent",
                          },
                        ]}
                      >
                        {d.selected && (
                          <Feather name="check" size={12} color={c.primaryForeground} />
                        )}
                      </Pressable>
                      <View style={styles.eventBody}>
                        <Text style={[styles.eventTitle, { color: c.foreground }]} numberOfLines={1}>
                          {d.title}
                        </Text>
                        <Text style={[styles.eventMeta, { color: c.mutedForeground }]}>
                          {d.sessionDate}
                          {d.startTime ? ` · ${d.startTime}` : ""}
                          {d.durationMin ? ` · ${d.durationMin}m` : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          setDrafts((prev) =>
                            prev
                              ? prev.map((p, i) =>
                                  i === idx
                                    ? { ...p, sessionType: nextType(p.sessionType) }
                                    : p
                                )
                              : prev
                          )
                        }
                        style={[styles.typeChip, { borderColor: c.border }]}
                      >
                        <Text style={[styles.typeText, { color: c.secondaryForeground }]}>
                          {TYPE_LABEL[d.sessionType]}
                        </Text>
                        <Feather name="chevron-right" size={11} color={c.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                </>
              )}

              <Pressable
                onPress={() => setPushManual((v) => !v)}
                style={styles.toggleRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: pushManual ? c.primary : c.border,
                      backgroundColor: pushManual ? c.primary : "transparent",
                    },
                  ]}
                >
                  {pushManual && (
                    <Feather name="check" size={12} color={c.primaryForeground} />
                  )}
                </View>
                <Text style={[styles.toggleText, { color: c.secondaryForeground }]}>
                  Also push my manual sessions to Google
                </Text>
              </Pressable>

              <View style={styles.btnRow}>
                <Pressable
                  onPress={apply}
                  disabled={applyMut.isPending}
                  style={[styles.btn, styles.btnSolid, { backgroundColor: c.primary }]}
                >
                  {applyMut.isPending ? (
                    <ActivityIndicator size="small" color={c.primaryForeground} />
                  ) : (
                    <Text style={[styles.btnText, { color: c.primaryForeground }]}>
                      Apply
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setDrafts(null)}
                  style={[styles.btn, { borderColor: c.border }]}
                >
                  <Text style={[styles.btnText, { color: c.mutedForeground }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.sub, { color: c.mutedForeground }]}>
            Link your Google Calendar to import training events and push camp sessions
            both ways.
          </Text>
          <Pressable
            onPress={connect}
            disabled={linking || startMut.isPending}
            style={[styles.btn, styles.btnSolid, { backgroundColor: c.primary }]}
          >
            {linking || startMut.isPending ? (
              <ActivityIndicator size="small" color={c.primaryForeground} />
            ) : (
              <>
                <Feather name="link" size={13} color={c.primaryForeground} />
                <Text style={[styles.btnText, { color: c.primaryForeground }]}>
                  Connect Google Calendar
                </Text>
              </>
            )}
          </Pressable>
        </>
      )}

      {err && <Text style={[styles.err, { color: c.destructive }]}>{err}</Text>}
    </View>
  );
}

function needsReconnect(msg: string): boolean {
  return /409|reconnect|invalid_grant|expired|revoked/i.test(msg);
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 14,
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },
  sub: { fontSize: 12, lineHeight: 17 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flex: 1,
  },
  btnSolid: { borderWidth: 0 },
  btnText: { fontSize: 12, fontWeight: "600" },
  previewWrap: { gap: 8, marginTop: 4 },
  previewHead: { fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    padding: 9,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eventBody: { flex: 1, gap: 2 },
  eventTitle: { fontSize: 12, fontWeight: "500" },
  eventMeta: { fontSize: 11 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  typeText: { fontSize: 11, fontWeight: "500" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  toggleText: { fontSize: 12, flex: 1 },
  err: { fontSize: 12, marginTop: 2 },
});
