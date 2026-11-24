import { Feather } from "@expo/vector-icons";
import {
  getGetNotificationsQueryKey,
  useGetNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GOLD } from "@/constants/colors";
import { TEXT_SECONDARY, caption, label, sectionTitle } from "@/constants/typography";

function relativeTime(value: string): string {
  const age = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(value).toLocaleDateString();
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useGetNotifications();
  const markRead = useMarkNotificationRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
    },
  });
  const markAllRead = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
    },
  });

  const openNotification = (notification: Notification) => {
    if (!notification.readAt) {
      void markRead.mutateAsync({ id: notification.id }).catch(() => undefined);
    }
    router.replace("/(tabs)/home");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
          testID="notifications-back"
        >
          <Feather name="arrow-left" size={20} color={GOLD} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>FRAME</Text>
          <Text style={styles.title}>Notifications</Text>
        </View>
        {(query.data?.unreadCount ?? 0) > 0 && (
          <Pressable
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            testID="mark-all-notifications-read"
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GOLD} />
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={24} color={TEXT_SECONDARY} />
          <Text style={styles.emptyTitle}>Couldn’t load notifications</Text>
          <Text style={styles.emptyBody}>Check your connection and try again.</Text>
          <Pressable onPress={() => query.refetch()} style={styles.retryButton} testID="retry-notifications">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (query.data?.notifications.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Feather name="bell" size={26} color={GOLD} />
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyBody}>Updates from FRAME will show here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {query.data!.notifications.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.row, !item.readAt && styles.unreadRow, pressed && styles.pressed]}
              onPress={() => void openNotification(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.readAt ? "" : "Unread. "}${item.title}. ${item.body}`}
              testID={`notification-${item.id}`}
            >
              <View style={styles.iconWrap}>
                <Feather name={item.kind === "analysis_finished" ? "film" : item.kind === "fight_approaching" ? "calendar" : "activity"} size={17} color={GOLD} />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {!item.readAt && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
              </View>
              <Feather name="chevron-right" size={16} color="#666" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  backButton: { width: 36, height: 40, justifyContent: "center" },
  heading: { flex: 1 },
  eyebrow: { ...caption, color: GOLD, letterSpacing: 1.4 },
  title: { ...sectionTitle, color: "#e0e0e0", fontSize: 22, marginTop: 2 },
  markAll: { ...label, color: GOLD },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  unreadRow: { backgroundColor: "#0d0c09" },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#17130c",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  itemTitle: { color: "#e0e0e0", fontFamily: "Outfit", fontSize: 15, fontWeight: "600", flex: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD },
  body: { color: TEXT_SECONDARY, fontFamily: "Outfit", fontSize: 13, lineHeight: 19 },
  time: { ...caption, color: "#777", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 10 },
  emptyTitle: { ...sectionTitle, color: "#e0e0e0", marginTop: 5 },
  emptyBody: { color: TEXT_SECONDARY, fontFamily: "Outfit", fontSize: 14, textAlign: "center" },
  retryButton: { borderWidth: 1, borderColor: GOLD, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  retryText: { ...label, color: GOLD },
});
