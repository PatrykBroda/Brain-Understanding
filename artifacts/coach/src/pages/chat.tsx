import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowUp, ArrowUpRight, Square, RefreshCcw, ChevronLeft, Paperclip, X, Mic } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { MessageContent } from "@/components/message-content";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { EntrySequence } from "@/components/entry-sequence";
import { CompetitionBanner } from "@/components/competition-banner";
import { FrameWordmark } from "@/components/frame-wordmark";
import { api, attachmentFileUrl, type AttachmentDto } from "@/lib/api";
import { useAuthedObjectUrl } from "@/lib/useAuthedObjectUrl";
import { useQueryClient } from "@tanstack/react-query";

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Analyse session", prompt: "Debrief my last training session — what fragmented, what held, what's the next rep." },
  { label: "Build drill", prompt: "Prescribe me a drill for my biggest current weakness. Use the drill block." },
  { label: "Fix my game", prompt: "Diagnose the recurring leak in my game right now and tell me the protocol to close it." },
  { label: "Competition prep", prompt: "Walk me through how to prepare my nervous system and tactics for an upcoming competition." },
  { label: "Regulate", prompt: "I need to regulate right now. Produce a regulate block." },
  { label: "Reflect", prompt: "Ask me one sharp question to surface what I'm not seeing about my training this week." },
];

const SUGGESTED_PROMPTS = [
  "Debrief tonight's roll",
  "I fragmented under pressure today",
  "What's my next rep on the half-guard pass?",
];

const MAX_FILE_BYTES = 12 * 1024 * 1024;

function AttachmentThumb({
  att,
  onRemove,
}: {
  att: AttachmentDto;
  onRemove?: () => void;
}) {
  // The file route is bearer-auth gated and a raw <img>/<video> can't send the
  // header, so load the bytes through an authed object URL instead.
  const url = useAuthedObjectUrl(attachmentFileUrl(att.id));
  return (
    <div className="relative inline-block border border-white/10 bg-[#08090B] overflow-hidden rounded-[14px]">
      {!url ? (
        <div className="flex h-24 w-24 items-center justify-center text-muted-foreground text-[0.8125rem]">
          Loading
        </div>
      ) : att.kind === "image" ? (
        <img
          src={url}
          alt={att.filename}
          className="block max-h-64 max-w-full object-contain"
        />
      ) : (
        <video
          src={url}
          controls
          className="block max-h-64 max-w-full object-contain bg-black"
        />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 w-9 h-9 bg-[#08090B]/85 hover:bg-[#08090B] border border-white/15 flex items-center justify-center text-foreground/85 hover:text-foreground transition-colors rounded-[12px]"
          aria-label="Remove attachment"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  const {
    messages,
    input,
    setInput,
    isStreaming,
    error,
    isLoading,
    conversationId,
    sendMessage,
    retry,
    stop,
    reset,
  } = useChat();

  useAutoWelcome();

  // EntrySequence is a first-ever-entry experience: show once, never repeat.
  // Backed by localStorage so it survives same-day reopens and re-navigation.
  // Must NOT reset on navigation — that is the root of the repeat-loading bug.
  const [entryActive, setEntryActive] = useState<boolean>(() => {
    try {
      return !localStorage.getItem("frame:chat-entry-seen");
    } catch {
      return false; // storage blocked — skip
    }
  });

  // Mark seen on first mount so navigating away mid-sequence also suppresses
  // future replays (the sequence's auto-dismiss will still finish normally).
  useEffect(() => {
    if (entryActive) {
      try {
        localStorage.setItem("frame:chat-entry-seen", "1");
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [drafts, setDrafts] = useState<AttachmentDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // State updates are asynchronous, so use a synchronous guard to cover the
  // awaited consent lookup and the complete stream lifecycle.
  const sendInFlightRef = useRef(false);
  const queryClient = useQueryClient();

  // Only reset drafts when the fighter changes — do NOT reset entryActive.
  useEffect(() => {
    setDrafts([]);
  }, [fighter?.id]);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !conversationId) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setUploadError(`${file.name} too large (max 12MB)`);
          continue;
        }
        const att = await api.uploadAttachment(conversationId, file);
        setDrafts((d) => [...d, att]);
      }
    } catch (err) {
      setUploadError((err as Error).message || "upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeDraft = (id: number) => {
    setDrafts((d) => d.filter((x) => x.id !== id));
  };

  const requestSend = async (
    content: string,
    attachments: AttachmentDto[] = [],
  ): Promise<boolean> => {
    if (isStreaming) return false;
    if (!content.trim() && attachments.length === 0) return false;
    if (sendInFlightRef.current) return false;
    sendInFlightRef.current = true;
    let waitingForConsent = false;
    try {
      const status = await api.getAiConsent();
      if (!status.accepted) {
        queryClient.setQueryData(["ai-consent"], status);
        waitingForConsent = true;
        return false;
      }
      return await sendMessage(content, attachments);
    } catch (err) {
      if (err instanceof Error && err.name === "ApiError" && (err as any).kind === "consent") {
        queryClient.invalidateQueries({ queryKey: ["ai-consent"] });
        waitingForConsent = true;
        return false;
      }
      setUploadError(err instanceof Error ? err.message : "Could not check AI permission.");
      return false;
    } finally {
      if (!waitingForConsent) sendInFlightRef.current = false;
    }
  };

  const doSend = async () => {
    if (isStreaming) return;
    if (!input.trim() && drafts.length === 0) return;
    const content = input;
    const attachments = drafts;
    const sent = await requestSend(content, attachments);
    if (sent) {
      setDrafts((current) => current.filter((draft) => !attachments.some((a) => a.id === draft.id)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const {
    supported: voiceSupported,
    listening,
    toggle: toggleVoice,
    stop: stopVoice,
  } = useSpeechRecognition({ onTranscript: setInput });

  useEffect(() => {
    if (isStreaming && listening) stopVoice();
  }, [isStreaming, listening, stopVoice]);

  const canSend = (input.trim().length > 0 || drafts.length > 0) && !isStreaming;

  return (
    <>
      {entryActive && (
        <EntrySequence
          fighterName={fighter?.name ?? null}
          onDismiss={() => setEntryActive(false)}
        />
      )}
      <div className="flex flex-col h-[100dvh] text-foreground font-sans">
        <header className="flex-none flex items-center justify-between gap-2 px-3 md:px-5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b border-white/[0.07] bg-[#08090B]">
          <Link href="/home" className="btn-quiet !border-transparent !px-2.5" aria-label="Back to home">
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            <span className="hidden sm:inline text-[0.875rem]">Home</span>
          </Link>
          <div className="flex items-center gap-3">
            <FrameWordmark size={22} />
            <FramePlusPill />
          </div>
          <button
            type="button"
            onClick={() => reset()}
            className="btn-quiet !border-transparent !px-2.5 text-muted-foreground hover:text-foreground"
            aria-label="Start a new conversation"
          >
            <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline text-[0.875rem]">New chat</span>
          </button>
        </header>

        <div className="flex-none px-5 md:px-6 pt-3 max-w-3xl w-full mx-auto">
          <CompetitionBanner />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 md:px-6 py-6">
            {isLoading ? (
              <div
                className="flex flex-col items-center justify-center gap-3 pt-24 text-muted-foreground text-[0.9375rem]"
                role="status"
              >
                <span className="h-5 w-5 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
                Loading your conversation
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col justify-center min-h-[52vh] gap-8 frame-rise">
                <div className="space-y-3 max-w-md">
                  <h1 className="display-title">Your corner is open.</h1>
                  <p className="text-[1.0625rem] leading-[1.6] text-muted-foreground">
                    Say what happened in training. Debrief a session, ask for a drill, regulate, or reflect.
                  </p>
                </div>
                <div className="w-full max-w-xl" role="list" aria-label="Suggested prompts">
                  <div className="label mb-2">Try asking</div>
                  <div className="glass overflow-hidden">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        role="listitem"
                        onClick={() => void requestSend(prompt)}
                        className="group flex w-full items-center justify-between gap-3 min-h-[56px] px-4 py-3 text-left text-[1rem] leading-snug text-foreground/90 border-t border-white/[0.06] first:border-t-0 hover:bg-white/[0.03] transition-colors"
                      >
                        <span>{prompt}</span>
                        <ArrowUpRight className="w-4 h-4 flex-none text-muted-foreground group-hover:text-[#B9A477] transition-colors" strokeWidth={1.5} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="label mb-2 !text-[#B9A477]">Coach</div>
                    )}
                    <div
                      className={
                        msg.role === "user"
                          ? "max-w-[88%] md:max-w-[34rem] space-y-2"
                          : "w-full text-foreground"
                      }
                    >
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={`flex flex-wrap gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                          {msg.attachments.map((a) => (
                            <AttachmentThumb key={a.id} att={a} />
                          ))}
                        </div>
                      )}
                      {msg.role === "assistant" && msg.pending && !msg.content ? (
                        <div className="flex items-center gap-3 py-1.5 text-[1rem] text-muted-foreground" role="status">
                          <span className="h-4 w-4 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
                          Coach is thinking…
                        </div>
                      ) : msg.role === "user" && msg.content ? (
                        <div className="rounded-[18px] rounded-br-[6px] border border-white/10 bg-[#191C20] text-foreground px-4 py-3 whitespace-pre-wrap text-[1.0625rem] leading-[1.6]">
                          {msg.content}
                        </div>
                      ) : msg.content ? (
                        <MessageContent
                          content={msg.content}
                          onTrain={(prompt) => {
                            if (!isStreaming) void requestSend(prompt);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
                {error && (
                  <div
                    role="alert"
                    className="glass glass-red p-4 flex flex-col sm:flex-row sm:items-center gap-3 text-[0.9375rem] leading-snug"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-[#E5645A]">Message did not go through</div>
                      <div className="text-foreground/80 mt-0.5">{error}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (sendInFlightRef.current) return;
                        sendInFlightRef.current = true;
                        void retry()
                          .then((result) => {
                            if (!result.success) return;
                            setDrafts((current) =>
                              current.filter(
                                (draft) => !result.attachments.some((a) => a.id === draft.id),
                              ),
                            );
                          })
                          .catch(() => {
                            // The hook surfaces ordinary stream failures in its
                            // error state; keep the preserved attachments here.
                          })
                          .finally(() => {
                            sendInFlightRef.current = false;
                          });
                      }}
                      disabled={isStreaming}
                      className="btn-quiet btn-quiet-red flex-none"
                    >
                      <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
                      Retry
                    </button>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </main>

        <footer className="flex-none px-3 md:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#08090B] border-t border-white/[0.07]">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex gap-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 pb-0.5" role="group" aria-label="Quick prompts">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => {
                    // Ignore taps while a reply streams instead of disabling
                    // the button (a dimmed label looked empty).
                    if (!isStreaming) void requestSend(qa.prompt);
                  }}
                  className="pill flex-none !px-4 !text-[0.875rem] whitespace-nowrap"
                >
                  {qa.label}
                </button>
              ))}
            </div>

            {drafts.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1">
                {drafts.map((d) => (
                  <AttachmentThumb key={d.id} att={d} onRemove={() => removeDraft(d.id)} />
                ))}
              </div>
            )}

            {uploadError && (
              <div className="text-[0.875rem] text-[#E5645A] px-1" role="alert">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                multiple
                onChange={handleFileChange}
                className="sr-only"
              />
              <div
                className={`flex items-end gap-1 rounded-[16px] border bg-[#111316] p-1.5 transition-colors ${
                  listening ? "border-[#B9A477]/60" : "border-white/[0.12] focus-within:border-[#B9A477]/50"
                } ${isStreaming ? "opacity-70" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || isStreaming || !conversationId}
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-40"
                  aria-label="Attach image or video"
                >
                  {uploading ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <Paperclip className="w-5 h-5" strokeWidth={1.5} />
                  )}
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={listening ? "Listening…" : "Message your coach"}
                  aria-label="Message your coach"
                  className="min-w-0 flex-1 resize-none bg-transparent border-0 outline-none focus:outline-none focus-visible:outline-none min-h-[44px] max-h-[200px] py-[10px] px-2 text-[1rem] leading-[1.5] text-foreground placeholder:text-[#8A8F96]"
                  rows={1}
                  disabled={isStreaming}
                  style={{ outline: "none" }}
                />
                {voiceSupported && !isStreaming && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-label={listening ? "Stop voice input" : "Speak your message"}
                    aria-pressed={listening}
                    className={`flex h-11 w-11 flex-none items-center justify-center rounded-[12px] transition-colors ${
                      listening
                        ? "bg-[#191C20] text-[#B9A477] frame-mic-live"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                    }`}
                  >
                    <Mic className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                )}
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    aria-label="Stop response"
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] border border-white/[0.12] bg-[#191C20] text-foreground hover:bg-[#1F2328] transition-colors"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Send message"
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-[#B9A477] text-[#0B0C0E] hover:bg-[#C4B084] active:bg-[#A8946A] disabled:bg-[#191C20] disabled:text-[#8A8F96] transition-colors"
                  >
                    <ArrowUp className="w-5 h-5" strokeWidth={2} />
                  </button>
                )}
              </div>
            </form>
          </div>
        </footer>
      </div>
    </>
  );
}
