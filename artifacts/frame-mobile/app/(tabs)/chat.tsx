import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { apiGet, apiStream } from "@/lib/api";
import { useFighter } from "@/context/FighterContext";
import { MessageContent } from "@/components/MessageContent";
import { CompetitionBanner } from "@/components/CompetitionBanner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let _counter = 0;
function uid() {
  _counter++;
  return `m-${Date.now()}-${_counter}-${Math.random().toString(36).slice(2, 7)}`;
}

const QUICK_ACTIONS = [
  "Analyse session",
  "Build a drill",
  "Fix my game",
  "Competition prep",
  "Regulate",
  "Reflect",
];

function MessageBubble({
  msg,
  onTrain,
}: {
  msg: Message;
  onTrain: (prompt: string) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <View style={[mb.row, isUser ? mb.userRow : mb.assistantRow]}>
      {!isUser && <View style={mb.dot} />}
      <View style={[mb.bubble, isUser ? mb.userBubble : mb.assistantBubble]}>
        {isUser ? (
          <Text style={[mb.text, mb.userText]}>{msg.content}</Text>
        ) : (
          <MessageContent content={msg.content} onTrain={onTrain} />
        )}
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: 4,
    paddingHorizontal: 16,
    alignItems: "flex-end",
    gap: 8,
  },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C9883A",
    marginBottom: 6,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  assistantBubble: {
    maxWidth: "94%",
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderLeftColor: "#C9883A",
    borderLeftWidth: 2,
  },
  text: {
    fontFamily: "Outfit",
    fontSize: 15,
    lineHeight: 22,
  },
  userText: { color: "#e0e0e0" },
  assistantText: { color: "#c0c0c0" },
});

function TypingIndicator() {
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={mb.dot} />
      <View style={[mb.bubble, mb.assistantBubble]}>
        <ActivityIndicator size="small" color="#C9883A" />
      </View>
    </View>
  );
}

interface ConversationResponse {
  conversation: { id: number } | null;
  messages: Array<{ id: number; role: string; content: string }>;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { fighter } = useFighter();
  const { isSignedIn } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  // On native the tab bar is absolutely positioned at 50px + safe-area inset,
  // so the input row needs to clear that full height.
  const bottomPad = Platform.OS === "web" ? 34 : 50;

  useEffect(() => {
    if (!isSignedIn) {
      setIsLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setIsLoadingHistory(true);
    apiGet<ConversationResponse>("/conversation/active")
      .then((data) => {
        if (cancelled) return;
        const loaded: Message[] = data.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        setMessages(loaded);
      })
      .catch(() => {
        // history unavailable — start fresh, no error shown
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  async function handleSend(text: string) {
    if (!text.trim() || isStreaming || !isSignedIn || isLoadingHistory) return;

    const trimmed = text.trim();
    setInput("");
    setIsStreaming(true);
    setShowTyping(true);

    const userMsg: Message = { id: uid(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);

    let fullContent = "";
    let added = false;

    try {
      await apiStream(
        "/coach/chat",
        { content: trimmed },
        (chunk) => {
          if (chunk.error) {
            setShowTyping(false);
            if (!added) {
              setMessages((prev) => [
                ...prev,
                { id: uid(), role: "assistant", content: "Something broke. Try again." },
              ]);
            }
            return;
          }
          if (chunk.content) {
            fullContent += chunk.content;
            setShowTyping(false);
            if (!added) {
              setMessages((prev) => [
                ...prev,
                { id: uid(), role: "assistant", content: fullContent },
              ]);
              added = true;
            } else {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: fullContent,
                };
                return updated;
              });
            }
          }
        }
      );
    } catch {
      setShowTyping(false);
      if (!added) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: "Connection dropped. Try again." },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }

    inputRef.current?.focus();
  }

  function sendQuick(prompt: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleSend(prompt);
  }

  const reversed = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: topPad }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.orbDot} />
          <Text style={styles.fighterName}>{fighter?.name ?? "FRAME"}</Text>
        </View>
      </View>

      <CompetitionBanner />

      {/* Messages */}
      {isLoadingHistory ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color="#C9883A" />
        </View>
      ) : (
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble msg={item} onTrain={handleSend} />}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>FRAME</Text>
              <Text style={styles.emptyText}>Your performance intelligence system is ready.</Text>
            </View>
          }
        />
      )}

      {/* Quick actions */}
      {!isLoadingHistory && messages.length === 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={styles.quickContent}
        >
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a}
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}
              onPress={() => sendQuick(a)}
              disabled={isStreaming}
            >
              <Text style={styles.quickText}>{a}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + bottomPad + 8 }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Enter transmission..."
          placeholderTextColor="#444"
          multiline
          maxLength={2000}
          blurOnSubmit={false}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            (!input.trim() || isStreaming || isLoadingHistory) && styles.sendBtnDisabled,
            pressed && input.trim() && !isStreaming && !isLoadingHistory && styles.sendBtnPressed,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleSend(input);
          }}
          disabled={!input.trim() || isStreaming || isLoadingHistory}
        >
          {isStreaming ? (
            <ActivityIndicator size="small" color="#666" />
          ) : (
            <Feather name="arrow-up" size={18} color={input.trim() ? "#050505" : "#444"} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  orbDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C9883A",
  },
  fighterName: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    letterSpacing: 3,
    color: "#e0e0e0",
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: "SpaceMono",
    fontSize: 24,
    letterSpacing: 10,
    color: "#1a1a1a",
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
  },
  quickRow: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    maxHeight: 52,
  },
  quickContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  quickChip: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  quickChipPressed: {
    borderColor: "#C9883A",
  },
  quickText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: "#666",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  input: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#C9883A",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#1a1a1a",
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
