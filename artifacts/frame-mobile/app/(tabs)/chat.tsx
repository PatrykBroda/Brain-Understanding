import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
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
import {
  REPLY_INTERRUPTED_LABEL,
  STILL_WORKING_AFTER_MS,
  STILL_WORKING_LABEL,
  THINKING_LABEL,
  hasCompleteReply,
  newClientMessageId,
  sendErrorMessage,
  streamErrorMessage,
  uploadErrorMessage,
} from "@/lib/chatErrors";
import { ANALYSE_SESSION_PROMPT, REGULATE_PROMPT } from "@/lib/chat-prompts";
import { useFighter } from "@/context/FighterContext";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MessageContent } from "@/components/MessageContent";
import { CompetitionBanner } from "@/components/CompetitionBanner";
import { OctagonSpinner } from "@/components/OctagonSpinner";
import { FrameLogo } from "@/components/FrameLogo";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { FREE_TEXT } from "@/lib/textInputProps";
import { TEXT_PRIMARY, TEXT_SECONDARY, body, label, meta, sectionTitle } from "@/constants/typography";

const MAX_FILE_BYTES = 12 * 1024 * 1024;

// How long to wait for the very first streamed byte before declaring the turn
// hung. Production first-token latency has been observed up to ~24s, so this is
// deliberately generous — we only give up when the line has genuinely gone quiet.
const FIRST_TOKEN_TIMEOUT_MS = 60_000;
// Once bytes are flowing, a gap longer than this means the stream stalled.
const STREAM_IDLE_TIMEOUT_MS = 30_000;
// Before calling a send failed, ask the server whether the reply landed anyway.
const RECOVERY_TIMEOUT_MS = 8_000;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AttachmentDto[];
  /** The send's idempotency key: on a user bubble, and on a failed / interrupted
   *  reply so RETRY resends with the same key (the server never answers twice). */
  clientMessageId?: string;
  /** set on an inline failure message: the text to resend when the athlete taps RETRY */
  retry?: string;
  retryAttachments?: AttachmentDto[];
  /** The stream stopped before the reply finished: `content` is what arrived. */
  interrupted?: boolean;
}

let _counter = 0;
function uid() {
  _counter++;
  return `m-${Date.now()}-${_counter}-${Math.random().toString(36).slice(2, 7)}`;
}

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: "Analyse session",
    prompt: ANALYSE_SESSION_PROMPT,
  },
  {
    label: "Build drill",
    prompt:
      "Build me a drill for my biggest current weakness. Use the drill block.",
  },
  {
    label: "Fix my game",
    prompt:
      "Identify the recurring gap in my game right now and give me a training plan to close it.",
  },
  {
    label: "Competition prep",
    prompt:
      "Walk me through how to prepare my composure, decision-making, and tactics for an upcoming competition.",
  },
  { label: "Regulate", prompt: REGULATE_PROMPT },
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

function RetryButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      style={[mb.retryBtn, disabled && mb.retryBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Feather name="refresh-ccw" size={12} color="#8A6A2F" />
      <Text style={mb.retryText}>Retry</Text>
    </Pressable>
  );
}

function MessageBubble({
  msg,
  onTrain,
  userLabel,
  onRetry,
  retryDisabled,
}: {
  msg: Message;
  onTrain: (prompt: string) => void;
  userLabel: string;
  onRetry: (msg: Message) => void;
  retryDisabled: boolean;
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
          ) : msg.interrupted ? (
            <>
              <MessageContent content={msg.content} onTrain={onTrain} />
              <View style={[mb.errorBox, mb.interruptedBox]} accessibilityRole="alert">
                <Text style={[mb.text, mb.assistantText]}>{REPLY_INTERRUPTED_LABEL}</Text>
                {msg.retry != null && <RetryButton onPress={() => onRetry(msg)} disabled={retryDisabled} />}
              </View>
            </>
          ) : msg.retry != null ? (
            <View style={mb.errorBox} accessibilityRole="alert">
              <Text style={mb.errorTitle}>Message not delivered</Text>
              <Text style={[mb.text, mb.assistantText]}>{msg.content}</Text>
              <RetryButton onPress={() => onRetry(msg)} disabled={retryDisabled} />
            </View>
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
    ...sectionTitle,
    marginBottom: 6,
    paddingHorizontal: 20,
  },
  senderLabelUser: {
    color: "#a8a8a8",
  },
  senderLabelFrame: {
    color: "rgba(138,106,47,0.7)",
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
    backgroundColor: "#8A6A2F",
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
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  text: {
    fontFamily: "Outfit",
    fontSize: 15,
    lineHeight: 22,
  },
  userText: { color: "#e0e0e0" },
  assistantText: { color: "#c0c0c0" },
  errorBox: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderLeftWidth: 2,
    borderLeftColor: "#8A6A2F",
  },
  errorTitle: {
    ...sectionTitle,
    color: "#8A6A2F",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#8A6A2F",
  },
  retryBtnDisabled: {
    opacity: 0.4,
  },
  interruptedBox: {
    marginTop: 10,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typingLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#a8a8a8",
  },
  retryText: {
    ...sectionTitle,
    color: "#8A6A2F",
  },
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
    ...meta,
    color: TEXT_SECONDARY,
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

// Mounted while a reply is pending: says FRAME is working, and says so again if
// it is slow, so a long first token never looks stuck.
function TypingIndicator() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), STILL_WORKING_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  const label = slow ? STILL_WORKING_LABEL : THINKING_LABEL;
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={mb.dot} />
      <View style={[mb.bubble, mb.assistantBubble, mb.typingRow]} accessibilityLiveRegion="polite" accessibilityLabel={label}>
        <OctagonSpinner size={30} color="#EDEDED" />
        <Text style={mb.typingLabel}>{label}</Text>
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
    clientMessageId?: string | null;
  }>;
}

function toMessages(data: ConversationResponse): Message[] {
  return data.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: String(m.id),
      role: m.role as "user" | "assistant",
      content: m.content,
      attachments: m.attachments ?? [],
      clientMessageId: m.clientMessageId ?? undefined,
    }));
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { fighter } = useFighter();
  const { isSignedIn } = useAuth();

  const userLabel = fighter?.name ?? "Operator";

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
  const pendingSendRef = useRef<{ text: string; attachments: AttachmentDto[]; clientMessageId?: string } | null>(null);
  // AI permission confirmed this session: skip the extra /ai-consent round trip on
  // every send. Cleared when the chat endpoint itself says consent is missing.
  const consentOkRef = useRef(false);
  // The send whose reply we haven't seen complete yet; re-checked on foreground.
  const pendingRecoveryRef = useRef<string | null>(null);
  // This guard is deliberately synchronous: React state does not update fast
  // enough to close the window between a tap and the consent lookup resolving.
  // It stays set while the consent sheet is open so acceptance can resume the
  // original turn without allowing a second tap to queue another one.
  const sendInFlightRef = useRef(false);
  const consentAcceptingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  // A coaching prompt handed over by another screen (an observation / State tip).
  // Only fills the composer; the athlete still taps send. `n` makes a repeat tap re-apply.
  const { prefill, n: prefillNonce } = useLocalSearchParams<{ prefill?: string; n?: string }>();
  useEffect(() => {
    if (typeof prefill !== "string" || !prefill) return;
    setInput(prefill);
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [prefill, prefillNonce]);
  // One-shot guards so on-device layout probes report once per mount,
  // not on every re-layout.

  useEffect(() => {
    if (isSignedIn) return;
    pendingSendRef.current = null;
    sendInFlightRef.current = false;
    consentOkRef.current = false;
    pendingRecoveryRef.current = null;
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
    Platform.OS === "web" ? 34 : keyboardVisible ? 0 : 50;
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
    // Warm the coach's prompt cache while the athlete reads and types, so the first
    // reply doesn't wait on it. Best effort; the server rate-limits it.
    apiPost("/coach/warm").catch(() => {});
    apiPost("/coach/welcome")
      .catch(() => {})
      .then(() => apiGet<ConversationResponse>("/conversation/active"))
      .then((data) => {
        if (cancelled) return;
        setConversationId(data.conversation?.id ?? null);
        setMessages(toMessages(data));
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

  /**
   * Ask the server whether the reply to this send was saved after all (the stream
   * dropped, the app was backgrounded, the watchdog fired). If it was, show the
   * server's thread instead of an error.
   */
  async function recoverReply(clientMessageId: string): Promise<boolean> {
    try {
      const data = await Promise.race([
        apiGet<ConversationResponse>("/conversation/active"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("recovery timed out")), RECOVERY_TIMEOUT_MS)),
      ]);
      if (!hasCompleteReply(data.messages, clientMessageId)) return false;
      setConversationId(data.conversation?.id ?? null);
      setMessages(toMessages(data));
      if (pendingRecoveryRef.current === clientMessageId) pendingRecoveryRef.current = null;
      return true;
    } catch {
      return false;
    }
  }

  // Back from the background with a send that never completed: the reply may have
  // landed while the app was away.
  useEffect(() => {
    if (!isSignedIn) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const pending = pendingRecoveryRef.current;
      if (!pending || sendInFlightRef.current) return;
      void recoverReply(pending);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  async function handleSend(
    text: string,
    attachments: AttachmentDto[] = [],
    resumeAfterConsent = false,
    clientMessageId?: string,
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

    // One idempotency key per send; a retry passes the same one back in.
    const cmid = clientMessageId ?? newClientMessageId();

    // Consent is checked before the first AI coaching request of the session and
    // again whenever it may have changed (the chat endpoint refused for consent,
    // or Profile recorded a withdrawal in the shared query cache). The server
    // still enforces it on every request. Keep the draft in the composer while
    // the sheet is open so accepting it can resume this exact message.
    const cachedConsent = qc.getQueryData<{ accepted?: boolean }>(["ai-consent"]);
    if (!resumeAfterConsent && (!consentOkRef.current || cachedConsent?.accepted === false)) {
      try {
        const status = await apiGet<AiConsentStatus>("/ai-consent");
        setConsentStatus(status);
        if (!status.accepted) {
          consentOkRef.current = false;
          pendingSendRef.current = { text, attachments, clientMessageId: cmid };
          setConsentVisible(true);
          return false;
        }
        consentOkRef.current = true;
      } catch (e: unknown) {
        sendInFlightRef.current = false;
        if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
          consentOkRef.current = false;
          qc.setQueryData(["ai-consent"], { accepted: false });
          return false;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: sendErrorMessage(e, { timedOut: false }),
            retry: text.trim(),
            retryAttachments: attachments,
            clientMessageId: cmid,
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
      clientMessageId: cmid,
    };
    setMessages((prev) => [...prev, userMsg]);
    pendingRecoveryRef.current = cmid;

    // Show a failure as a fresh assistant bubble (mobile has no error banner).
    const showAssistant = (content: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content, retry: trimmed, retryAttachments: attachments, clientMessageId: cmid },
      ]);
    };

    const assistantId = uid();
    let fullContent = "";
    let added = false;
    let receivedContent = false;
    let sawDone = false;
    let serverError = false;
    let serverErrorCode: string | undefined;
    let streamSucceeded = false;
    let recovered = false;

    // A transport failure: the reply may have been saved anyway. Show it if so,
    // otherwise the given error.
    const failOrRecover = async (message: string) => {
      if (await recoverReply(cmid)) recovered = true;
      else showAssistant(message);
    };
    // Text arrived but the stream never finished: keep what arrived, say so, and
    // offer a retry (same key, so the server replaces it rather than adding one).
    const markInterrupted = async () => {
      if (await recoverReply(cmid)) {
        recovered = true;
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, interrupted: true, retry: trimmed, retryAttachments: attachments, clientMessageId: cmid }
            : m,
        ),
      );
    };

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
        { content: trimmed, attachmentIds: attachments.map((a) => a.id), clientMessageId: cmid },
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
                { id: assistantId, role: "assistant", content: fullContent },
              ]);
              added = true;
            } else {
              const latest = fullContent;
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: latest } : m)));
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
          if (serverErrorCode === "AI_CONSENT_REQUIRED") {
            consentOkRef.current = false;
            qc.setQueryData(["ai-consent"], { accepted: false });
          }
          showAssistant(streamErrorMessage(serverErrorCode, attachments.length > 0));
        } else if (!sawDone) await failOrRecover("Lost the thread. Try again.");
      } else if (!sawDone || serverError) {
        await markInterrupted();
      }
      streamSucceeded = (sawDone && !serverError && !timedOut) || recovered;
    } catch (err) {
      setShowTyping(false);
      if (err instanceof ApiError && err.code === "AI_CONSENT_REQUIRED") {
        consentOkRef.current = false;
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
      } else if (receivedContent) {
        await markInterrupted();
      } else if (err instanceof ApiError) {
        // The server answered with an error status: nothing was generated.
        showAssistant(sendErrorMessage(err, { timedOut }));
      } else {
        await failOrRecover(sendErrorMessage(err, { timedOut }));
      }
      streamSucceeded = recovered;
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setIsStreaming(false);
      setShowTyping(false);
      sendInFlightRef.current = false;
    }

    if (streamSucceeded && pendingRecoveryRef.current === cmid) pendingRecoveryRef.current = null;
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
      consentOkRef.current = status.accepted;
      const sent = await handleSend(pending.text, pending.attachments, true, pending.clientMessageId);
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

  // Inline retry: drop the failed exchange (error / partial reply + the user bubble
  // it answered) and send again with the SAME client message id, so the server
  // returns the saved reply or the one in progress instead of generating twice.
  function retryMessage(failed: Message) {
    // sendInFlightRef is synchronous, so a double tap can't start two sends.
    if (isStreaming || sendInFlightRef.current || failed.retry == null) return;
    const text = failed.retry;
    const cmid = failed.clientMessageId;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === failed.id);
      if (idx < 0) return prev;
      const isOwnUser = (m: Message, i: number) =>
        m.role === "user" &&
        (cmid ? m.clientMessageId === cmid : i === idx - 1 && m.content === text);
      return prev.filter((m, i) => i !== idx && !isOwnUser(m, i));
    });
    setInput("");
    void handleSend(text, failed.retryAttachments ?? [], false, cmid);
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
          <Text style={styles.headerBackText}>Home</Text>
        </Pressable>
        <View style={styles.headerBrand} pointerEvents="none" accessibilityRole="header" accessibilityLabel="Frame">
          <FrameLogo height={16} />
        </View>
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
              <Text style={styles.headerResetText}>Reset</Text>
            </>
          )}
        </Pressable>
      </View>

      <CompetitionBanner />

      {/* Messages */}
      {isLoadingHistory ? (
        <View style={styles.loadingState}>
          <OctagonSpinner size={30} color="#EDEDED" />
        </View>
      ) : (
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              msg={item}
              onTrain={handleSend}
              userLabel={userLabel}
              onRetry={retryMessage}
              retryDisabled={isStreaming}
            />
          )}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyOpen}>FRAME open</Text>
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
        <View style={styles.quickRow}>
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
        </View>
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
              <OctagonSpinner size={16} color="#8A6A2F" />
              <Text style={styles.draftStatusText}>Uploading…</Text>
            </View>
          )}
          {uploadError && <Text style={styles.draftError}>{uploadError}</Text>}
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: inputBottomInset }]}>
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
          {...FREE_TEXT}
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
    </>
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
    ...sectionTitle,
  },
  // Centred on the whole header, independent of the side buttons' widths.
  headerBrand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerReset: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minWidth: 76,
  },
  headerResetText: {
    ...sectionTitle,
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
    ...sectionTitle,
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
    borderColor: "rgba(255,255,255,0.14)",
  },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  suggestBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  suggestDash: {
    ...label,
    fontSize: 13,
    lineHeight: 17,
    color: "#8A6A2F",
  },
  suggestText: {
    ...body,
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_PRIMARY,
    flexShrink: 1,
  },
  quickRow: {
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
    // Chips wrap onto a second line instead of running off the right edge.
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  quickChip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    justifyContent: "center",
  },
  quickChipPressed: {
    borderColor: "#8A6A2F",
  },
  quickText: {
    ...label,
    fontSize: 13,
    // Explicit lineHeight: some font metrics without one can measure
    // zero/near-zero text height on iOS, rendering the label invisible.
    lineHeight: 17,
    color: "#d0d0d0",
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
    ...label,
    color: "#8A6A2F",
  },
  draftError: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#d2553f",
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#8A6A2F",
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
