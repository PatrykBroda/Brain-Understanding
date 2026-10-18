import { useAuth } from "@/context/AuthContext";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { scheduleModelRefreshAfterChat } from "@/lib/modelRefresh";
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
import { sendErrorMessage, streamErrorMessage, uploadErrorMessage } from "@/lib/chatErrors";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MessageContent } from "@/components/MessageContent";
import { CompetitionBanner } from "@/components/CompetitionBanner";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { Body, Button, Display, FadeIn, IconButton, Label, Screen, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius, SCREEN_PAD, type as T } from "@/constants/theme";


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
  /** set on an inline failure message: the text to resend when the athlete taps Retry */
  retry?: string;
}

let _counter = 0;
function uid() {
  _counter++;
  return `m-${Date.now()}-${_counter}-${Math.random().toString(36).slice(2, 7)}`;
}

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: "Analyse session",
    prompt: "Debrief my last training session — what fragmented, what held, what's the next rep.",
  },
  { label: "Build drill", prompt: "Build me a drill for my biggest current weakness. Use the drill block." },
  {
    label: "Fix my game",
    prompt: "Identify the recurring gap in my game right now and give me a training plan to close it.",
  },
  {
    label: "Competition prep",
    prompt:
      "Walk me through how to prepare my composure, decision-making, and tactics for an upcoming competition.",
  },
  { label: "Regulate", prompt: "I need to regulate right now. Produce a regulate block." },
  {
    label: "Reflect",
    prompt: "Ask me one sharp question to surface what I'm not seeing about my training this week.",
  },
];

const SUGGESTED_PROMPTS = [
  "Debrief tonight's roll",
  "I fragmented under pressure today",
  "Build me a drill for my weakest position",
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
          <Feather name="x" size={14} color={palette.textHi} />
        </Pressable>
      )}
    </View>
  );
}

function MessageBubble({
  msg,
  onTrain,
  onRetry,
}: {
  msg: Message;
  onTrain: (prompt: string) => void;
  onRetry: (msg: Message) => void;
}) {
  const isUser = msg.role === "user";
  const hasAttachments = (msg.attachments?.length ?? 0) > 0;

  if (isUser) {
    return (
      <View style={mb.userWrap}>
        <View style={mb.userBubble}>
          {hasAttachments && (
            <View style={mb.attachGrid}>
              {msg.attachments!.map((a) => (
                <AttachmentThumb key={a.id} att={a} />
              ))}
            </View>
          )}
          {msg.content ? <Text style={mb.userText}>{msg.content}</Text> : null}
        </View>
      </View>
    );
  }

  if (msg.retry != null) {
    return (
      <View style={mb.coachWrap}>
        <Label style={mb.coachLabel}>Coach</Label>
        <View style={mb.errorBox} accessibilityRole="alert">
          <View style={mb.errorHead}>
            <Feather name="alert-circle" size={18} color={palette.redText} />
            <Text style={mb.errorTitle}>Message not delivered</Text>
          </View>
          <Text style={mb.errorBody}>{msg.content}</Text>
          <Button title="Retry" variant="secondary" onPress={() => onRetry(msg)} style={mb.retryBtn} />
        </View>
      </View>
    );
  }

  return (
    <View style={mb.coachWrap}>
      <Label style={mb.coachLabel}>Coach</Label>
      <MessageContent content={msg.content} onTrain={onTrain} />
    </View>
  );
}

const mb = StyleSheet.create({
  // user: right-aligned raised bubble, radius 18, tail corner 6
  userWrap: { alignItems: "flex-end", paddingHorizontal: SCREEN_PAD, marginTop: 16 },
  userBubble: {
    maxWidth: "86%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  userText: { ...T.chat, color: palette.textHi },
  // coach: plain text on the canvas, small label, comfortable measure
  coachWrap: { paddingHorizontal: SCREEN_PAD, marginTop: 20, maxWidth: 680, width: "100%" },
  coachLabel: { marginBottom: 6, color: palette.textMid },
  errorBox: {
    padding: 16,
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.redHair,
  },
  errorHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorTitle: { fontFamily: fonts.semi, fontSize: 16, color: palette.redText },
  errorBody: { ...T.bodySm, color: palette.textMid },
  retryBtn: { marginTop: 4, minHeight: 48 },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  videoThumb: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  videoName: { fontFamily: fonts.regular, fontSize: 12, color: palette.textMid, textAlign: "center" },
  thumbRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: palette.scrim,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
});

// Static (no pulsing): label + small spinner.
function TypingIndicator() {
  return (
    <View style={mb.coachWrap} accessibilityLiveRegion="polite" accessibilityLabel="Coach is thinking">
      <Label style={mb.coachLabel}>Coach</Label>
      <View style={styles.thinking}>
        <ActivityIndicator size="small" color={palette.textMid} />
        <Text style={styles.thinkingText}>Coach is thinking</Text>
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
  const { isSignedIn } = useAuth();

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

  // A coaching prompt handed over by another screen (the State tip). Only fills
  // the composer; the athlete still taps send. `n` makes a repeat tap re-apply.
  const { prefill, n: prefillNonce } = useLocalSearchParams<{ prefill?: string; n?: string }>();
  useEffect(() => {
    if (typeof prefill !== "string" || !prefill) return;
    setInput(prefill);
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [prefill, prefillNonce]);

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
    const showAssistant = (content: string) => {
      haptic.error();
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content, retry: trimmed }]);
    };

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
            // The memory extractor runs after the reply; refresh the model once it has written.
            scheduleModelRefreshAfterChat(qc);
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
    if (streamSucceeded) haptic.success();
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
    haptic.press();
    handleSend(prompt);
  }

  // Inline retry: drop the failed exchange (error + the user bubble it answered) and send again.
  function retryMessage(failed: { id: string; retry?: string }) {
    if (isStreaming || failed.retry == null) return;
    const text = failed.retry;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === failed.id);
      if (idx < 0) return prev;
      const cut = idx > 0 && prev[idx - 1].role === "user" && prev[idx - 1].content === text ? idx - 1 : idx;
      return prev.filter((_, i) => i !== idx && i !== cut);
    });
    setInput("");
    handleSend(text);
  }

  async function resetConversation() {
    if (isStreaming || resetting) return;
    haptic.press();
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
    haptic.press();
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
    haptic.press();
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
    <Screen light={null}>
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: topPad }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          onPress={() => router.push("/(tabs)/home")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Feather name="chevron-left" size={20} color={palette.textHi} />
          <Text style={styles.headerBtnText}>Home</Text>
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Coach
        </Text>
        <Pressable
          style={({ pressed }) => [styles.headerBtn, styles.headerBtnRight, pressed && styles.headerBtnPressed]}
          onPress={resetConversation}
          disabled={isStreaming || resetting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Reset conversation"
        >
          {resetting ? (
            <ActivityIndicator size="small" color={palette.textMid} />
          ) : (
            <>
              <Feather name="refresh-ccw" size={15} color={palette.textMid} />
              <Text style={[styles.headerBtnText, { color: palette.textMid }]}>Reset</Text>
            </>
          )}
        </Pressable>
      </View>

      <CompetitionBanner />

      {/* Messages */}
      {isLoadingHistory ? (
        <View style={styles.loadingState} accessibilityLabel="Loading conversation">
          <ActivityIndicator color={palette.textMid} />
          <Text style={styles.loadingText}>Loading conversation</Text>
        </View>
      ) : (
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble msg={item} onTrain={handleSend} onRetry={retryMessage} />}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <FadeIn style={styles.emptyState}>
              <Display size="title" style={styles.emptyTitle}>
                What are we working on?
              </Display>
              <Body style={styles.emptyText}>
                Say what happened. Debrief a session, request a drill, regulate, or reflect.
              </Body>
              <View style={styles.suggestGrid}>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    accessibilityLabel={prompt}
                    style={({ pressed }) => [styles.suggestBtn, pressed && styles.suggestBtnPressed]}
                    onPress={() => sendQuick(prompt)}
                    disabled={isStreaming || isLoadingHistory}
                  >
                    <Text style={styles.suggestText}>{prompt}</Text>
                    <Feather name="arrow-up-right" size={18} color={palette.textMid} />
                  </Pressable>
                ))}
              </View>
            </FadeIn>
          }
        />
      )}

      {/* Suggested prompts: a chip row above the composer once a conversation exists
          (the empty state shows its own list). */}
      {!isLoadingHistory && messages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={styles.quickContent}
        >
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed, isStreaming && { opacity: 0.4 }]}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.draftStrip}>
              {drafts.map((d) => (
                <AttachmentThumb key={d.att.id} att={d.att} uri={d.uri} onRemove={() => removeDraft(d.att.id)} />
              ))}
            </ScrollView>
          )}
          {uploading && (
            <View style={styles.draftStatus}>
              <ActivityIndicator size="small" color={palette.textMid} />
              <Text style={styles.draftStatusText}>Uploading</Text>
            </View>
          )}
          {uploadError && <Text style={styles.draftError}>{uploadError}</Text>}
        </View>
      )}

      {/* Composer: attach, solid field with voice, gold send */}
      <View style={[styles.inputRow, { paddingBottom: inputBottomInset }]}>
        <IconButton
          icon="plus"
          label="Attach a file"
          onPress={pickAttachment}
          disabled={!conversationId || uploading || isStreaming}
        />
        <View style={[styles.composer, listening && styles.composerLive]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={listening ? "Listening" : "Message your coach"}
            placeholderTextColor={listening ? palette.redText : palette.textLow}
            selectionColor={palette.gold}
            accessibilityLabel="Message"
            multiline
            maxLength={2000}
            blurOnSubmit={false}
          />
          {voiceSupported && !isStreaming && (
            <Pressable
              style={({ pressed }) => [styles.micBtn, listening && styles.micBtnLive, pressed && { opacity: 0.7 }]}
              onPress={() => {
                haptic.select();
                toggleVoice();
              }}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={listening ? "Stop voice input" : "Start voice input"}
              accessibilityState={{ selected: listening }}
            >
              <Feather name="mic" size={19} color={listening ? palette.redText : palette.textMid} />
            </Pressable>
          )}
        </View>
        {isStreaming ? (
          <View style={styles.sendBusy} accessibilityLabel="Sending">
            <ActivityIndicator size="small" color={palette.textMid} />
          </View>
        ) : (
          <IconButton icon="arrow-up" label="Send message" solid onPress={doSend} disabled={!canSend} />
        )}
      </View>
    </KeyboardAvoidingView>
    </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: MIN_TAP,
    minWidth: 80,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  headerBtnRight: { justifyContent: "flex-end", gap: 6 },
  headerBtnPressed: { backgroundColor: palette.surface },
  headerBtnText: { fontFamily: fonts.medium, fontSize: 15, color: palette.textHi },
  headerTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi, letterSpacing: -0.2 },
  listContent: { paddingTop: 8, paddingBottom: 16, flexGrow: 1 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  thinkingText: { ...T.chat, color: palette.textMid },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: SCREEN_PAD,
  },
  emptyTitle: { marginBottom: 12 },
  emptyText: { marginBottom: 28, maxWidth: 340 },
  suggestGrid: { width: "100%", maxWidth: 480, gap: 10 },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  suggestBtnPressed: { backgroundColor: palette.raised, borderColor: palette.borderStrong },
  suggestText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: palette.textHi, flexShrink: 1 },
  quickRow: {
    height: 56,
    // Never let the KeyboardAvoidingView flex math compress this row.
    flexGrow: 0,
    flexShrink: 0,
  },
  quickContent: { paddingHorizontal: SCREEN_PAD, paddingVertical: 6, gap: 8, alignItems: "center" },
  quickChip: {
    minHeight: MIN_TAP,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    alignSelf: "center",
    justifyContent: "center",
  },
  quickChipPressed: { backgroundColor: palette.raised, borderColor: palette.borderStrong },
  quickText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: palette.textHi },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    gap: 8,
  },
  composer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: MIN_TAP,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    paddingLeft: 14,
    paddingRight: 2,
  },
  // listening = static ring, no animation
  composerLive: { borderColor: palette.redText },
  input: {
    flex: 1,
    color: palette.textHi,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  micBtn: {
    width: MIN_TAP,
    height: MIN_TAP - 2,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnLive: { backgroundColor: palette.redWash },
  sendBusy: {
    width: MIN_TAP,
    height: MIN_TAP,
    borderRadius: radius.md,
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  draftRow: { paddingHorizontal: SCREEN_PAD, paddingTop: 10, gap: 8 },
  draftStrip: { gap: 8, paddingBottom: 2 },
  draftStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  draftStatusText: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  draftError: { fontFamily: fonts.regular, fontSize: 13, color: palette.redText },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: fonts.regular, fontSize: 14, color: palette.textMid },
});
