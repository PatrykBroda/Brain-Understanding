import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, coachChatUrl, type ServerMessage } from "@/lib/api";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

function toClient(msg: ServerMessage): ChatMessage {
  return { id: `s-${msg.id}`, role: msg.role, content: msg.content };
}

export function useChat() {
  const qc = useQueryClient();
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
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;
      stop();
      setError(null);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantId = `a-${Date.now()}`;
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

      try {
        const res = await fetch(coachChatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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
                setError(evt.error);
                continue;
              }
              if ("done" in evt) {
                setIsStreaming(false);
                qc.invalidateQueries({ queryKey: ["conversation"] });
                qc.invalidateQueries({ queryKey: ["calibration", "next"] });
                return;
              }
              if ("content" in evt) {
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
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message || "stream failed");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, qc, stop],
  );

  return {
    messages: localMessages,
    input,
    setInput,
    isStreaming,
    error,
    isLoading: conversationQuery.isLoading,
    sendMessage,
    stop,
    reset: () => resetMutation.mutate(),
    resetting: resetMutation.isPending,
    userTurnsThisSession,
    bumpCalibrationCounter: () => setUserTurnsThisSession(0),
  };
}
