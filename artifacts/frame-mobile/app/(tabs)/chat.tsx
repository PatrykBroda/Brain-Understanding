import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
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
import {
  apiGet,
  apiPost,
  apiStream,
  attachmentFileUrl,
  uploadAttachment,
  type AttachmentDto,
} from "@/lib/api";
import { useFighter } from "@/context/FighterContext";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MessageContent } from "@/components/MessageContent";
import { CompetitionBanner } from "@/components/CompetitionBanner";
import { OctagonSpinner } from "@/components/OctagonSpinner";

const FRAME_WORDMARK = require("@/assets/images/frame-wordmark.png");

const MAX_FILE_BYTES = 12 * 1024 * 1024;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AttachmentDto[];
}

let _counter = 0;
function uid() {
  _counter++;
  return `m-${Date.now()}-${_counter}-${Math.random().toString(36).slice(2, 7)}`;
}

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: "Analyse session",
    prompt:
      "Debrief my last training session — what fragmented, what held, what's the next rep.",
  },
  {
    label: "Build drill",
    prompt:
      "Prescribe me a drill for my biggest current weakness. Use the drill block.",
  },
  {
    label: "Fix my game",
    prompt:
      "Diagnose the recurring leak in my game right now and tell me the protocol to close it.",
  },
  {
    label: "Competition prep",
    prompt:
      "Walk me through how to prepare my nervous system and tactics for an upcoming competition.",
  },
  { label: "Regulate", prompt: "I need to regulate right now. Produce a regulate block." },
  {
    label: "Reflect",
    prompt:
      "Ask me one sharp question to surface what I'm not seeing about my training this week.",
  },
];

const SUGGESTED_PROMPTS = [
  "Debrief tonight's roll",
  "I fragmented under pressure today",
  "Walk me through a containment cycle",
  "What's my next rep on the half-guard pass?",
];

// A single attached image/video. Drafts pass a local `uri` (instant preview,
// no round-trip); sent/history attachments resolve to the server file by id.
function AttachmentThumb({
  att,
  uri,
  onRemove,
}: {
  att: AttachmentDto;
  uri?: string;
  onRemove?: () => void;
}) {
  const src = uri ?? attachmentFileUrl(att.id);
  return (
    <View style={mb.thumb}>
      {att.kind === "video" ? (
        <View style={mb.videoThumb}>
          <Feather name="video" size={20} color="#888" />
          <Text style={mb.videoName} numberOfLines={1}>
            {att.filename}
          </Text>
        </View>
      ) : (
        <Image source={{ uri: src }} style={mb.thumbImg} resizeMode="cover" />
      )}
      {onRemove && (
        <Pressable style={mb.thumbRemove} onPress={onRemove} hitSlop={6}>
          <Feather name="x" size={12} color="#e0e0e0" />
        </Pressable>
      )}
    </View>
  );
}

function MessageBubble({
  msg,
  onTrain,
  userLabel,
}: {
  msg: Message;
  onTrain: (prompt: string) => void;
  userLabel: string;
}) {
  const isUser = msg.role === "user";
  const hasAttachments = (msg.attachments?.length ?? 0) > 0;
  return (
    <View style={[mb.wrap, isUser ? mb.wrapUser : mb.wrapAssistant]}>
      <Text style={[mb.senderLabel, isUser ? mb.senderLabelUser : mb.senderLabelFrame]}>
        {isUser ? userLabel : "FRAME"}
      </Text>
      <View style={[mb.row, isUser ? mb.userRow : mb.assistantRow]}>
        {!isUser && <View style={mb.dot} />}
        <View style={[mb.bubble, isUser ? mb.userBubble : mb.assistantBubble]}>
          {hasAttachments && (
            <View style={mb.attachGrid}>
              {msg.attachments!.map((a) => (
                <AttachmentThumb key={a.id} att={a} />
              ))}
            </View>
          )}
          {isUser ? (
            msg.content ? (
              <Text style={[mb.text, mb.userText]}>{msg.content}</Text>
            ) : null
          ) : (
            <MessageContent content={msg.content} onTrain={onTrain} />
          )}
        </View>
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  wrap: {
    marginVertical: 10,
  },
  wrapUser: {
    alignItems: "flex-end",
  },
  wrapAssistant: {
    alignItems: "flex-start",
  },
  senderLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingHorizontal: 20,
  },
  senderLabelUser: {
    color: "rgba(224,224,224,0.4)",
  },
  senderLabelFrame: {
    color: "rgba(201,136,58,0.7)",
  },
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
  attachGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  thumb: {
    width: 120,
    height: 120,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  videoThumb: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  videoName: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "#888",
    textAlign: "center",
  },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    backgroundColor: "rgba(5,5,5,0.85)",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
});

function TypingIndicator() {
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={mb.dot} />
      <View style={[mb.bubble, mb.assistantBubble]}>
        <OctagonSpinner size={22} color="#C9883A" />
      </View>
    </View>
  );
}

interface ConversationResponse {
  conversation: { id: number } | null;
  messages: Array<{
    id: number;
    role: string;
    content: string;
    attachments?: AttachmentDto[];
  }>;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { fighter } = useFighter();
  const { isSignedIn } = useAuth();

  const userLabel = (fighter?.name ?? "Operator").toUpperCase();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<{ att: AttachmentDto; uri: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const {
    supported: voiceSupported,
    listening,
    toggle: toggleVoice,
    stop: stopVoice,
  } = useSpeechRecognition({ onTranscript: setInput });

  // Stop listening the moment a response starts streaming.
  useEffect(() => {
    if (isStreaming && listening) stopVoice();
  }, [isStreaming, listening, stopVoice]);

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
    // FRAME's one proactive message: fire the idempotent welcome before loading
    // history so a freshly onboarded athlete opens chat to FRAME's opening line
    // instead of an empty thread. The server no-ops for anyone who already has a
    // message, so this is safe on every mount; a swallowed error (e.g. no
    // fighter yet) just falls through to loading whatever history exists.
    apiPost("/coach/welcome")
      .catch(() => {})
      .then(() => apiGet<ConversationResponse>("/conversation/active"))
      .then((data) => {
        if (cancelled) return;
        setConversationId(data.conversation?.id ?? null);
        const loaded: Message[] = data.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
            attachments: m.attachments ?? [],
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

  async function handleSend(text: string, attachments: AttachmentDto[] = []) {
    if (
      (!text.trim() && attachments.length === 0) ||
      isStreaming ||
      !isSignedIn ||
      isLoadingHistory
    )
      return;

    const trimmed = text.trim();
    setInput("");
    setIsStreaming(true);
    setShowTyping(true);

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: trimmed,
      attachments,
    };
    setMessages((prev) => [...prev, userMsg]);

    let fullContent = "";
    let added = false;

    try {
      await apiStream(
        "/coach/chat",
        { content: trimmed, attachmentIds: attachments.map((a) => a.id) },
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

  async function resetConversation() {
    if (isStreaming || resetting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setResetting(true);
    try {
      const data = await apiPost<ConversationResponse>("/conversation/reset");
      setConversationId(data.conversation?.id ?? null);
      setMessages([]);
      setInput("");
      setDrafts([]);
      setUploadError(null);
    } catch {
      // reset failed — leave the current thread intact
    } finally {
      setResetting(false);
    }
  }

  async function pickAttachment() {
    if (!conversationId) {
      setUploadError("Send a message first to start the conversation.");
      return;
    }
    setUploadError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setUploadError("Media permission is needed to attach files.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      setUploadError("Could not read that file.");
      return;
    }
    if (asset.base64.length * 0.75 > MAX_FILE_BYTES) {
      setUploadError("File too large (max 12MB).");
      return;
    }
    const kind: "image" | "video" = asset.type === "video" ? "video" : "image";
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const att = await uploadAttachment({
        conversationId,
        kind,
        mimeType: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
        filename: asset.fileName ?? (kind === "video" ? "clip.mp4" : "image.jpg"),
        dataBase64: asset.base64,
      });
      setDrafts((d) => [...d, { att, uri: asset.uri }]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removeDraft(id: number) {
    setDrafts((d) => d.filter((x) => x.att.id !== id));
  }

  function doSend() {
    if (isStreaming || isLoadingHistory) return;
    if (!input.trim() && drafts.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleSend(
      input,
      drafts.map((d) => d.att),
    );
    setDrafts([]);
  }

  const reversed = [...messages].reverse();
  const canSend =
    (input.trim().length > 0 || drafts.length > 0) && !isStreaming && !isLoadingHistory;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: topPad }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerBack}
          onPress={() => router.push("/(tabs)/home")}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color="#888" />
          <Text style={styles.headerBackText}>FRAME</Text>
        </Pressable>
        <Image source={FRAME_WORDMARK} style={styles.headerWordmark} resizeMode="contain" />
        <Pressable
          style={styles.headerReset}
          onPress={resetConversation}
          disabled={isStreaming || resetting}
          hitSlop={8}
        >
          {resetting ? (
            <OctagonSpinner size={14} color="#888" />
          ) : (
            <>
              <Feather name="refresh-ccw" size={12} color="#888" />
              <Text style={styles.headerResetText}>RESET</Text>
            </>
          )}
        </Pressable>
      </View>

      <CompetitionBanner />

      {/* Messages */}
      {isLoadingHistory ? (
        <View style={styles.loadingState}>
          <OctagonSpinner size={28} color="#C9883A" />
        </View>
      ) : (
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble msg={item} onTrain={handleSend} userLabel={userLabel} />
          )}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyOpen}>FRAME OPEN</Text>
              <Text style={styles.emptyText}>
                Say what happened. Debrief a session, request a drill, regulate, or reflect.
              </Text>
              <View style={styles.suggestGrid}>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    style={({ pressed }) => [
                      styles.suggestBtn,
                      pressed && styles.suggestBtnPressed,
                    ]}
                    onPress={() => sendQuick(prompt)}
                    disabled={isStreaming || isLoadingHistory}
                  >
                    <Text style={styles.suggestDash}>—</Text>
                    <Text style={styles.suggestText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
        />
      )}

      {/* Quick actions — persist above the input in both the empty state and an
          active conversation (matches the website's suggested-question chips,
          which stay available while chatting instead of disappearing). */}
      {!isLoadingHistory && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={styles.quickContent}
        >
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.label}
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}
              onPress={() => sendQuick(a.prompt)}
              disabled={isStreaming}
            >
              <Text style={styles.quickText}>{a.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Draft attachments awaiting send */}
      {(drafts.length > 0 || uploading || uploadError) && (
        <View style={styles.draftRow}>
          {drafts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.draftStrip}
            >
              {drafts.map((d) => (
                <AttachmentThumb
                  key={d.att.id}
                  att={d.att}
                  uri={d.uri}
                  onRemove={() => removeDraft(d.att.id)}
                />
              ))}
            </ScrollView>
          )}
          {uploading && (
            <View style={styles.draftStatus}>
              <OctagonSpinner size={16} color="#C9883A" />
              <Text style={styles.draftStatusText}>UPLOADING…</Text>
            </View>
          )}
          {uploadError && <Text style={styles.draftError}>{uploadError}</Text>}
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + bottomPad + 8 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.attachBtn,
            (!conversationId || uploading || isStreaming) && styles.attachBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
          onPress={pickAttachment}
          disabled={!conversationId || uploading || isStreaming}
          hitSlop={6}
        >
          <Feather
            name="plus"
            size={20}
            color={!conversationId || uploading || isStreaming ? "#333" : "#888"}
          />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={listening ? "Listening..." : "Enter transmission..."}
          placeholderTextColor="#444"
          multiline
          maxLength={2000}
          blurOnSubmit={false}
        />
        {voiceSupported && !isStreaming && (
          <Pressable
            style={({ pressed }) => [
              styles.micBtn,
              listening && styles.micBtnLive,
              pressed && styles.sendBtnPressed,
            ]}
            onPress={toggleVoice}
            hitSlop={6}
          >
            <Feather name="mic" size={18} color={listening ? "#d2553f" : "#888"} />
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          onPress={doSend}
          disabled={!canSend}
        >
          {isStreaming ? (
            <OctagonSpinner size={20} color="#666" />
          ) : (
            <Feather name="arrow-up" size={18} color={canSend ? "#050505" : "#444"} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  headerBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 76,
  },
  headerBackText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#888",
  },
  headerWordmark: {
    width: 96,
    height: 22,
  },
  headerReset: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minWidth: 76,
  },
  headerResetText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#888",
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 28,
  },
  emptyOpen: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 8,
    color: "rgba(224,224,224,0.45)",
    marginBottom: 16,
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 16,
    color: "rgba(224,224,224,0.7)",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 320,
    marginBottom: 28,
  },
  suggestGrid: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  suggestBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  suggestDash: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    color: "rgba(201,136,58,0.5)",
  },
  suggestText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    letterSpacing: 0.5,
    color: "rgba(224,224,224,0.55)",
    flexShrink: 1,
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
  attachBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnDisabled: {
    opacity: 0.5,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnLive: {
    borderColor: "#d2553f",
    backgroundColor: "rgba(210,85,63,0.12)",
  },
  draftRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  draftStrip: {
    gap: 8,
    paddingBottom: 2,
  },
  draftStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  draftStatusText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#C9883A",
  },
  draftError: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#d2553f",
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
