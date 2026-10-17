import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  apiGet,
  apiPatch,
  apiPost,
  apiStream,
  apiUrl,
  attachmentFileUrl,
  uploadAttachment,
  type AttachmentDto,
} from "@/lib/api";
import { reportLayout } from "@/lib/crashReporter";
import { sendErrorMessage, streamErrorMessage, uploadErrorMessage } from "@/lib/chatErrors";
import { useFighter } from "@/context/FighterContext";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MessageContent } from "@/components/MessageContent";
import { CompetitionBanner } from "@/components/CompetitionBanner";
import { OctagonSpinner } from "@/components/OctagonSpinner";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { Display, Eyebrow, FadeIn, Screen } from "@/components/ui";
import { fonts, palette, radius } from "@/constants/theme";

const FRAME_WORDMARK = require("@/assets/images/frame-wordmark.png");

const MAX_FILE_BYTES = 12 * 1024 * 1024;

// How long to wait for the very first streamed byte before declaring the turn
// hung. Production first-token latency has been observed up to ~24s, so this is
// deliberately generous — we only give up when the line has genuinely gone quiet.
const FIRST_TOKEN_TIMEOUT_MS = 60_000;
// Once bytes are flowing, a gap longer than this means the stream stalled.
const STREAM_IDLE_TIMEOUT_MS = 30_000;

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
    label: "ANALYSE SESSION",
    prompt:
      "Debrief my last training session — what fragmented, what held, what's the next rep.",
  },
  {
    label: "BUILD DRILL",
    prompt:
      "Build me a drill for my biggest current weakness. Use the drill block.",
  },
  {
    label: "FIX MY GAME",
    prompt:
      "Identify the recurring gap in my game right now and give me a training plan to close it.",
  },
  {
    label: "COMPETITION PREP",
    prompt:
      "Walk me through how to prepare my composure, decision-making, and tactics for an upcoming competition.",
  },
  { label: "REGULATE", prompt: "I need to regulate right now. Produce a regulate block." },
  {
    label: "REFLECT",
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
          <Feather name="video" size={20} color={palette.textMid} />
          <Text style={mb.videoName} numberOfLines={1}>
            {att.filename}
          </Text>
        </View>
      ) : (
        <Image source={{ uri: src }} style={mb.thumbImg} resizeMode="cover" />
      )}
      {onRemove && (
        <Pressable
          style={mb.thumbRemove}
          onPress={onRemove}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
        >
          <Feather name="x" size={12} color={palette.text} />
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
    marginVertical: 8,
  },
  wrapUser: {
    alignItems: "flex-end",
  },
  wrapAssistant: {
    alignItems: "flex-start",
  },
  senderLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingHorizontal: 22,
  },
  senderLabelUser: {
    color: palette.textLow,
  },
  senderLabelFrame: {
    color: palette.goldLight,
  },
  row: {
    flexDirection: "row",
    marginVertical: 2,
    paddingHorizontal: 16,
    alignItems: "flex-end",
    gap: 8,
  },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "84%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  // user = bronze-tinted glass
  userBubble: {
    backgroundColor: "rgba(138,106,47,0.20)",
    borderColor: palette.goldHair,
    borderRadius: 22,
    borderBottomRightRadius: 6,
  },
  // coach = graphite glass
  assistantBubble: {
    maxWidth: "94%",
    backgroundColor: palette.graphite2,
    borderColor: palette.glassEdge,
    borderRadius: 22,
    borderBottomLeftRadius: 6,
  },
  text: {
    fontFamily: fonts.text,
    fontSize: 15,
    lineHeight: 22,
  },
  userText: { color: palette.textHi },
  assistantText: { color: palette.text },
  attachGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: palette.graphite0,
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
    fontFamily: fonts.text,
    fontSize: 10,
    color: palette.textMid,
    textAlign: "center",
  },
  thumbRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(5,5,5,0.8)",
    borderWidth: 1,
    borderColor: palette.glassEdge,
    alignItems: "center",
    justifyContent: "center",
  },
});

function TypingIndicator() {
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={[mb.bubble, mb.assistantBubble]}>
        <OctagonSpinner size={26} color={palette.goldPale} />
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
  const qc = useQueryClient();
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
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentStatus, setConsentStatus] = useState<AiConsentStatus | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const pendingSendRef = useRef<{ text: string; attachments: AttachmentDto[] } | null>(null);
  // This guard is deliberately synchronous: React state does not update fast
  // enough to close the window between a tap and the consent lookup resolving.
  // It stays set while the consent sheet is open so acceptance can resume the
  // original turn without allowing a second tap to queue another one.
  const sendInFlightRef = useRef(false);
  const consentAcceptingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  // One-shot guards so on-device layout probes report once per mount,
  // not on every re-layout.
  const layoutProbes = useRef({ row: false, chip: false, text: false });

  useEffect(() => {
    if (isSignedIn) return;
    pendingSendRef.current = null;
    sendInFlightRef.current = false;
    setConsentVisible(false);
  }, [isSignedIn]);

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
  // so the input row needs to clear that full height — but only while the
  // keyboard is down. Once the keyboard is up it covers the tab bar, so that
  // clearance would just open a dead gap above the keyboard. Collapse it then.
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  const bottomPad =
    Platform.OS === "web" ? 84 : keyboardVisible ? 0 : 56;
  const inputBottomInset = keyboardVisible ? 8 : insets.bottom + bottomPad + 8;

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

  async function handleSend(
    text: string,
    attachments: AttachmentDto[] = [],
    resumeAfterConsent = false,
  ): Promise<boolean> {
    if (
      (!text.trim() && attachments.length === 0) ||
      isStreaming ||
      !isSignedIn ||
      isLoadingHistory
    )
      return false;
    if (resumeAfterConsent ? !sendInFlightRef.current : sendInFlightRef.current) {
      return false;
    }
    if (!resumeAfterConsent) sendInFlightRef.current = true;

    // Consent is checked at the boundary immediately before each AI coaching
    // request. This also notices a withdrawal made from Profile while this
    // tab stayed mounted. Keep the draft in the composer while the sheet is
    // open so accepting it can resume this exact message and attachments.
    if (!resumeAfterConsent) {
      try {
        const status = await apiGet<AiConsentStatus>("/ai-consent");
        setConsentStatus(status);
        if (!status.accepted) {
          pendingSendRef.current = { text, attachments };
          setConsentVisible(true);
          return false;
        }
      } catch (e: unknown) {
        sendInFlightRef.current = false;
        if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
          qc.setQueryData(["ai-consent"], { accepted: false });
          return false;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: (e as Error).message ?? "Could not check AI permission.",
          },
        ]);
        return false;
      }
    }

    // Invalidate the active recognition session before clearing the composer.
    // iOS may deliver one final result after stop(); the hook ignores it.
    stopVoice();
    const trimmed = text.trim();
    setInput("");
    setIsStreaming(true);
    setShowTyping(true);

    const userMsgId = uid();
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: trimmed,
      attachments,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Show a failure as a fresh assistant bubble (mobile has no error banner).
    const showAssistant = (content: string) =>
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content }]);

    let fullContent = "";
    let added = false;
    let receivedContent = false;
    let sawDone = false;
    let serverError = false;
    let serverErrorCode: string | undefined;
    let streamSucceeded = false;

    // Watchdog: abort a turn that never produces a first byte, or that stalls
    // mid-stream. Without this a hung request sits forever behind the spinner.
    const ctrl = new AbortController();
    let timedOut = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = (ms: number) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, ms);
    };
    armWatchdog(FIRST_TOKEN_TIMEOUT_MS);

    try {
      await apiStream(
        "/coach/chat",
        { content: trimmed, attachmentIds: attachments.map((a) => a.id) },
        (chunk) => {
          if (chunk.error) {
            serverError = true;
            serverErrorCode = chunk.code;
            setShowTyping(false);
            return;
          }
          if (chunk.done) {
            sawDone = true;
            return;
          }
          if (chunk.content) {
            // Bytes are flowing — reset the (now shorter) idle watchdog.
            armWatchdog(STREAM_IDLE_TIMEOUT_MS);
            receivedContent = true;
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
        },
        ctrl.signal,
      );

      // Stream closed cleanly. If nothing streamed, say why rather than leaving
      // a silent, stuck spinner.
      setShowTyping(false);
      if (!receivedContent) {
        if (serverError) {
          if (serverErrorCode === "AI_CONSENT_REQUIRED") qc.setQueryData(["ai-consent"], { accepted: false });
          showAssistant(streamErrorMessage(serverErrorCode, attachments.length > 0));
        }
        else if (!sawDone) showAssistant("Lost the thread. Try again.");
      }
      streamSucceeded = sawDone && !serverError && !timedOut;
    } catch (err) {
      setShowTyping(false);
      if (err instanceof ApiError && err.code === "AI_CONSENT_REQUIRED") {
        qc.setQueryData(["ai-consent"], { accepted: false });
        return false;
      }
      // Free-tier daily coaching limit: not a failed turn. Drop the optimistic
      // user bubble, restore the draft so nothing is lost, and open the paywall
      // — mirroring the web client instead of a misleading "connection" error.
      if (err instanceof ApiError && err.status === 402) {
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        setInput(trimmed);
        if (err.code === "FRAME_PLUS_REQUIRED") router.push("/paywall");
        else showAssistant("That message couldn't be sent.");
      } else if (!receivedContent) {
        showAssistant(sendErrorMessage(err, { timedOut }));
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setIsStreaming(false);
      setShowTyping(false);
      sendInFlightRef.current = false;
    }

    inputRef.current?.focus();
    if (!streamSucceeded && trimmed) setInput(trimmed);
    return streamSucceeded;
  }

  async function acceptConsentAndSend() {
    if (consentAcceptingRef.current) return;
    const pending = pendingSendRef.current;
    if (!pending) {
      setConsentVisible(false);
      sendInFlightRef.current = false;
      return;
    }
    consentAcceptingRef.current = true;
    setConsentBusy(true);
    try {
      const status = await apiPatch<AiConsentStatus>("/ai-consent", { accepted: true });
      qc.setQueryData(["ai-consent"], status);
      setConsentStatus(status);
      pendingSendRef.current = null;
      setConsentVisible(false);
      const sent = await handleSend(pending.text, pending.attachments, true);
      if (sent) setDrafts((draft) => draft.filter((d) => !pending.attachments.some((a) => a.id === d.att.id)));
    } catch (e: unknown) {
      sendInFlightRef.current = false;
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: (e as Error).message ?? "Could not save AI permission." },
      ]);
    } finally {
      setConsentBusy(false);
      consentAcceptingRef.current = false;
    }
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
      setUploadError(uploadErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function removeDraft(id: number) {
    setDrafts((d) => d.filter((x) => x.att.id !== id));
  }

  async function doSend() {
    if (isStreaming || isLoadingHistory) return;
    if (!input.trim() && drafts.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = input;
    const attachments = drafts.map((d) => d.att);
    const sent = await handleSend(
      text,
      attachments,
    );
    if (sent) setDrafts((draft) => draft.filter((d) => !attachments.some((a) => a.id === d.att.id)));
  }

  const reversed = [...messages].reverse();
  const canSend =
    (input.trim().length > 0 || drafts.length > 0) && !isStreaming && !isLoadingHistory;

  return (
    <>
    <AiConsentModal
      visible={consentVisible}
      status={consentStatus}
      busy={consentBusy}
      onAccept={() => void acceptConsentAndSend()}
      onDecline={() => {
        pendingSendRef.current = null;
        sendInFlightRef.current = false;
        setConsentVisible(false);
        qc.setQueryData(["ai-consent"], { accepted: false });
      }}
      onPrivacy={() => void Linking.openURL(apiUrl("/privacy"))}
    />
    <Screen>
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: topPad }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerPill}
          onPress={() => router.push("/(tabs)/home")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Feather name="chevron-left" size={18} color={palette.text} />
          <Text style={styles.headerPillText}>Home</Text>
        </Pressable>
        <Image source={FRAME_WORDMARK} style={styles.headerWordmark} resizeMode="contain" />
        <Pressable
          style={[styles.headerPill, styles.headerReset]}
          onPress={resetConversation}
          disabled={isStreaming || resetting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Reset conversation"
        >
          {resetting ? (
            <OctagonSpinner size={14} color={palette.textMid} />
          ) : (
            <>
              <Feather name="refresh-ccw" size={13} color={palette.text} />
              <Text style={styles.headerPillText}>Reset</Text>
            </>
          )}
        </Pressable>
      </View>

      <CompetitionBanner />

      {/* Messages */}
      {isLoadingHistory ? (
        <View style={styles.loadingState}>
          <OctagonSpinner size={30} color={palette.goldPale} />
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
            <FadeIn style={styles.emptyState}>
              <Eyebrow style={styles.emptyOpen}>Frame open</Eyebrow>
              <Display size="title" style={styles.emptyTitle}>
                What are we working on?
              </Display>
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
                    <Text style={styles.suggestText}>{prompt}</Text>
                    <Feather name="arrow-up-right" size={16} color={palette.goldLight} />
                  </Pressable>
                ))}
              </View>
            </FadeIn>
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
          onLayout={(e) => {
            if (layoutProbes.current.row) return;
            layoutProbes.current.row = true;
            const { width, height } = e.nativeEvent.layout;
            reportLayout(`quickRow w=${Math.round(width)} h=${Math.round(height)}`);
          }}
        >
          {QUICK_ACTIONS.map((a, i) => (
            <Pressable
              key={a.label}
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}
              onPress={() => sendQuick(a.prompt)}
              disabled={isStreaming}
              onLayout={
                i === 0
                  ? (e) => {
                      if (layoutProbes.current.chip) return;
                      layoutProbes.current.chip = true;
                      const { width, height } = e.nativeEvent.layout;
                      reportLayout(`quickChip[0] w=${Math.round(width)} h=${Math.round(height)}`);
                    }
                  : undefined
              }
            >
              <Text
                style={styles.quickText}
                onTextLayout={
                  i === 0
                    ? (e) => {
                        if (layoutProbes.current.text) return;
                        layoutProbes.current.text = true;
                        const lines = e.nativeEvent.lines;
                        reportLayout(
                          `quickText[0] lines=${lines.length} h=${Math.round(lines[0]?.height ?? 0)} w=${Math.round(lines[0]?.width ?? 0)}`,
                        );
                      }
                    : undefined
                }
              >
                {a.label}
              </Text>
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
              <OctagonSpinner size={16} color={palette.goldLight} />
              <Text style={styles.draftStatusText}>Uploading…</Text>
            </View>
          )}
          {uploadError && <Text style={styles.draftError}>{uploadError}</Text>}
        </View>
      )}

      {/* Input — glass pill composer with a round send button */}
      <View style={[styles.inputRow, { paddingBottom: inputBottomInset }]}>
        <Pressable
          style={({ pressed }) => [
            styles.roundBtn,
            (!conversationId || uploading || isStreaming) && styles.attachBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
          onPress={pickAttachment}
          disabled={!conversationId || uploading || isStreaming}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
        >
          <Feather
            name="plus"
            size={20}
            color={!conversationId || uploading || isStreaming ? palette.textLow : palette.text}
          />
        </Pressable>
        <View style={styles.composer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={listening ? "Listening..." : "Enter transmission..."}
            placeholderTextColor={palette.textLow}
            selectionColor={palette.goldLight}
            accessibilityLabel="Message"
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
              accessibilityRole="button"
              accessibilityLabel={listening ? "Stop voice input" : "Start voice input"}
            >
              <Feather name="mic" size={18} color={listening ? palette.redLight : palette.textMid} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          onPress={doSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {isStreaming ? (
            <OctagonSpinner size={20} color={palette.textMid} />
          ) : (
            <Feather name="arrow-up" size={19} color={canSend ? "#050505" : palette.textLow} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassEdge,
  },
  headerReset: {
    paddingHorizontal: 16,
  },
  headerPillText: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 0.6,
    color: palette.text,
  },
  headerWordmark: {
    width: 96,
    height: 22,
    tintColor: palette.text,
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyOpen: {
    color: palette.goldLight,
    marginBottom: 10,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: palette.textMid,
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 320,
    marginBottom: 28,
  },
  suggestGrid: {
    width: "100%",
    maxWidth: 420,
    gap: 10,
  },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassEdge,
  },
  suggestBtnPressed: {
    backgroundColor: palette.goldWash,
    borderColor: palette.goldHair,
  },
  suggestText: {
    fontFamily: fonts.text,
    fontSize: 14.5,
    lineHeight: 20,
    color: palette.text,
    flexShrink: 1,
  },
  quickRow: {
    height: 56,
    // Never let the KeyboardAvoidingView flex math compress this row —
    // vertical squash clips the chip text into flat empty strips.
    flexGrow: 0,
    flexShrink: 0,
  },
  quickContent: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    alignItems: "center",
  },
  quickChip: {
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    paddingHorizontal: 18,
    alignSelf: "center",
    justifyContent: "center",
  },
  quickChipPressed: {
    backgroundColor: palette.goldWash,
    borderColor: palette.goldHair,
  },
  quickText: {
    fontFamily: fonts.textMedium,
    fontSize: 11.5,
    // Explicit lineHeight so the label can never measure as zero height.
    lineHeight: 15,
    color: palette.goldPale,
    letterSpacing: 1.2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  composer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 48,
    borderRadius: 26,
    backgroundColor: palette.graphite2,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    paddingLeft: 18,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    color: palette.textHi,
    fontFamily: fonts.text,
    fontSize: 15,
    paddingTop: 13,
    paddingBottom: 13,
    maxHeight: 120,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.glassStrong,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnDisabled: {
    opacity: 0.5,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  micBtnLive: {
    backgroundColor: palette.redWash,
  },
  draftRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
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
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    color: palette.goldLight,
    textTransform: "uppercase",
  },
  draftError: {
    fontFamily: fonts.text,
    fontSize: 12.5,
    color: palette.redLight,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#B38F4B",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#8A6A2F",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  sendBtnDisabled: {
    backgroundColor: palette.graphite3,
    shadowOpacity: 0,
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
