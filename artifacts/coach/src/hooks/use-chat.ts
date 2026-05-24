import { useState, useRef, useCallback } from "react";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const clearChat = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
    setInput("");
  }, [stop]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    stop();
    setError(null);
    
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMessageId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantMessageId, role: "assistant", content: "" }]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          
          const dataStr = line.slice("data: ".length);
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            
            if (data.error) {
              setError(data.error);
              setIsStreaming(false);
              return;
            }

            if (data.done) {
              setIsStreaming(false);
              return;
            }

            if (data.content) {
              setMessages((prev) => 
                prev.map(m => 
                  m.id === assistantMessageId 
                    ? { ...m, content: m.content + data.content }
                    : m
                )
              );
            }
          } catch (e) {
            console.error("Failed to parse SSE JSON:", e, dataStr);
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Chat aborted");
      } else {
        console.error("Chat error:", err);
        setError(err.message || "An error occurred");
      }
      setIsStreaming(false);
    }
  }, [messages, stop]);

  return {
    messages,
    input,
    setInput,
    isStreaming,
    error,
    sendMessage,
    stop,
    clearChat
  };
}
