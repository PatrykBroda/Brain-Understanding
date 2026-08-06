import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, authHeaders, coachChatUrl, type AiProvider, type AttachmentDto, type ServerMessage } from "@/lib/api";
import { useFramePlus } from "@/components/frame-plus-modal";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  attachments?: AttachmentDto[];
};

function toClient(msg: ServerMessage): ChatMessage {
  return {
    id: `s-${msg.id}`,
    role: msg.role,
    content: msg.content,
    attachments: msg.attachments ?? [],
  };
}

// How long to wait for the very first byte before declaring the turn hung.
// Production first-token latency has been observed up to ~24s, so this is
// deliberately generous — we only give up when the line has genuinely gone quiet.
const FIRST_TOKEN_TIMEOUT_MS = 60_000;
// Once bytes are flowing, a gap longer than this means the stream stalled.
const STREAM_IDLE_TIMEOUT_MS = 30_000;

export function useChat() {
  const qc = useQueryClient();
  const { openUpgrade } = useFramePlus();
  const conversationQuery = useQuery({
    queryKey: ["conversation"],
    queryFn: () => api.getActiveConversation(),
  });

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userTurnsThisSession, setUserTurnsThisSession] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastAttemptRef = useRef<{ content: string; attachments: AttachmentDto[] } | null>(null);
  const lastUserBubbleIdRef = useRef<string | null>(null);
  const lastAssistantBubbleIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationQuery.data) {
      setLocalMessages(conversationQuery.data.messages.map(toClient));
      setError(null);
    }
  }, [conversationQuery.data]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const resetMutation = useMutation({
    mutationFn: () => api.resetConversation(),
    onSuccess: (data) => {
      stop();
      setError(null);
      setInput("");
      setLocalMessages(data.messages.map(toClient));
      setUserTurnsThisSession(0);
      qc.setQueryData(["conversation"], data);
    },
  });

  const sendMessage = useCallback(
    async (content: string, attachments: AttachmentDto[] = []) => {
      const trimmed = content.trim();
      if (!trimmed && attachments.length === 0) return;
      if (isStreaming) return;
      stop();
      setError(null);

      // Remember this attempt so a failed turn can be retried one-tap.
      lastAttemptRef.current = { content: trimmed, attachments };

      const userBubbleId = `u-${Date.now()}`;
      const assistantId = `a-${Date.now()}`;
      lastUserBubbleIdRef.current = userBubbleId;
      lastAssistantBubbleIdRef.current = assistantId;

      const userMsg: ChatMessage = {
        id: userBubbleId,
        role: "user",
        content: trimmed,
        attachments,
      };
      setLocalMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", pending: true },
      ]);
      setInput("");
      setIsStreaming(true);
      setUserTurnsThisSession((n) => n + 1);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let timedOut = false;
      let receivedContent = false;
      let outcome: "done" | "server-error" | null = null;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const armWatchdog = (ms: number) => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, ms);
      };

      // Settle the assistant bubble after a non-success: keep partial text but
      // stop the spinner; if nothing streamed, drop the empty bubble entirely
      // so we never leave a silent, stuck "sensing" placeholder.
      const settleBubble = () => {
        setLocalMessages((prev) => {
          if (receivedContent) {
            return prev.map((m) =>
              m.id === assistantId ? { ...m, pending: false } : m,
            );
          }
          return prev.filter((m) => m.id !== assistantId);
        });
      };
      const failTurn = (message: string) => {
        settleBubble();
        setError(message);
      };

      armWatchdog(FIRST_TOKEN_TIMEOUT_MS);

      try {
        const res = await fetch(coachChatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            content: trimmed,
            attachmentIds: attachments.map((a) => a.id),
          }),
          signal: ctrl.signal,
        });
        if (res.status === 402) {
          // Free-tier daily limit. Not a failed turn: drop the optimistic
          // bubbles, restore the draft so nothing is lost, open the upgrade
          // modal. No error banner, no retry affordance.
          let payload: { code?: string } = {};
          try {
            payload = (await res.json()) as { code?: string };
          } catch {}
          lastAttemptRef.current = null;
          setLocalMessages((prev) =>
            prev.filter((m) => m.id !== userBubbleId && m.id !== assistantId),
          );
          setInput(trimmed);
          if (payload.code === "FRAME_PLUS_REQUIRED") {
            openUpgrade("coaching");
          } else {
            setError("That message couldn't be sent.");
          }
          return;
        }
        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Bytes are flowing — reset the (now shorter) idle watchdog.
          armWatchdog(STREAM_IDLE_TIMEOUT_MS);
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() ?? "";
          for (const block of blocks) {
            if (!block.startsWith("data: ")) continue;
            const payload = block.slice(6);
            try {
              const evt = JSON.parse(payload) as
                | { content: string }
                | { done: true }
                | { error: string };
              if ("error" in evt) {
                outcome = "server-error";
                continue;
              }
              if ("done" in evt) {
                outcome = "done";
                continue;
              }
              if ("content" in evt) {
                receivedContent = true;
                setLocalMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + evt.content, pending: false }
                      : m,
                  ),
                );
              }
            } catch {
              // ignore partial / bad lines
            }
          }
          if (outcome) break;
        }

        if (outcome === "done") {
          lastAttemptRef.current = null;
          qc.invalidateQueries({ queryKey: ["conversation"] });
          qc.invalidateQueries({ queryKey: ["calibration", "next"] });
        } else if (outcome === "server-error") {
          failTurn("Something jammed on my end. Send that again.");
        } else {
          // Stream closed with no completion signal — interrupted, not done.
          failTurn("Lost the thread. Send that again.");
        }
      } catch (err) {
        const e = err as Error;
        if (timedOut) {
          failTurn("That hung — the line went quiet. Send it again.");
        } else if (e.name === "AbortError") {
          // User pressed stop: keep whatever streamed, surface no error.
          settleBubble();
        } else {
          failTurn("Connection dropped. Send that again.");
        }
      } finally {
        if (watchdog) clearTimeout(watchdog);
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, qc, stop, openUpgrade],
  );

  const retry = useCallback(() => {
    const last = lastAttemptRef.current;
    if (!last || isStreaming) return;
    setError(null);
    // Drop the failed turn's bubbles; sendMessage re-adds them fresh. The
    // server reuses the orphaned user row, so retry doesn't duplicate history.
    setLocalMessages((prev) =>
      prev.filter(
        (m) =>
          m.id !== lastUserBubbleIdRef.current &&
          m.id !== lastAssistantBubbleIdRef.current,
      ),
    );
    void sendMessage(last.content, last.attachments);
  }, [isStreaming, sendMessage]);

  return {
    messages: localMessages,
    input,
    setInput,
    isStreaming,
    error,
    isLoading: conversationQuery.isLoading,
    conversationId: conversationQuery.data?.conversation?.id ?? null,
    sendMessage,
    retry,
    stop,
    reset: () => resetMutation.mutate(),
    resetting: resetMutation.isPending,
    userTurnsThisSession,
    bumpCalibrationCounter: () => setUserTurnsThisSession(0),
    provider: (conversationQuery.data?.conversation?.aiProvider ?? "claude") as AiProvider,
    setProvider: async (p: AiProvider) => {
      await api.setConversationProvider(p);
      qc.invalidateQueries({ queryKey: ["conversation"] });
    },
  };
}
