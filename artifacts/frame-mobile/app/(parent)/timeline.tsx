import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/entry";
import { palette } from "@/constants/entryTheme";
import { Card, ErrorBox, H, Notice, Page, T } from "@/components/junior/ui";
import { emptyStateCopy, timelineDayLabel, timelineLabel, type EmptyState, type JuniorMe, type TimelineItem } from "@/lib/junior";

interface TimelinePage { items: TimelineItem[]; nextBefore: string | null; emptyState: EmptyState | null }

export default function TimelineScreen() {
  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me") });
  const kids = me.data?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const childId = picked ?? kids[0]?.id ?? null;
  const q = useInfiniteQuery({
    queryKey: ["junior", "timeline", childId],
    enabled: !!childId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiGet<TimelinePage>(`/junior/children/${childId}/timeline${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => last.nextBefore,
  });

  if (!childId) return <Page title="Timeline"><Notice>Add a child on the Home tab to start their timeline.</Notice></Page>;
  if (q.isError) return <Page title="Timeline"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  const pages = q.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const empty = emptyStateCopy(pages[0]?.emptyState);
  let lastDay = "";
  return (
    <Page title="Timeline" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {kids.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          {kids.map((k) => (
            <Pressable key={k.id} onPress={() => setPicked(k.id)} accessibilityRole="button">
              <Text style={{ color: k.id === childId ? palette.gold : palette.textMid, fontSize: 16 }}>{k.displayName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {empty ? <Notice>{empty}</Notice> : null}
      {items.map((it, i) => {
        const day = timelineDayLabel(it.at);
        const head = day !== lastDay;
        lastDay = day;
        return (
          <View key={`${it.type}-${it.refId ?? i}-${it.at}`}>
            {head ? <H>{day}</H> : null}
            <Card>
              <T dim>{timelineLabel(it.type)}</T>
              <T>{it.title}</T>
              {it.detail ? <T dim>{it.detail}</T> : null}
            </Card>
          </View>
        );
      })}
      {q.hasNextPage ? <Button title={q.isFetchingNextPage ? "Loading..." : "Earlier"} variant="ghost" onPress={() => void q.fetchNextPage()} /> : null}
    </Page>
  );
}
