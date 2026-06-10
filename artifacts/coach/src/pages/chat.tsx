import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Send, Square, RefreshCcw, ChevronLeft, Paperclip, X, Mic } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { MessageContent } from "@/components/message-content";
import { NervousSystemOrb } from "@/components/nervous-system-orb";
import { EntrySequence } from "@/components/entry-sequence";
import { BottomNav } from "@/components/bottom-nav";
import { CompetitionBanner } from "@/components/competition-banner";
import { FrameOctagon } from "@/components/frame-octagon";
import { Button } from "@/components/ui/button";
import { api, attachmentFileUrl, type AttachmentDto } from "@/lib/api";

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Analyse session", prompt: "Debrief my last training session — what fragmented, what held, what's the next rep." },
  { label: "Build drill", prompt: "Prescribe me a drill for my biggest current weakness. Use the drill block." },
  { label: "Fix my game", prompt: "Diagnose the recurring leak in my game right now and tell me the protocol to close it." },
  { label: "Competition prep", prompt: "Walk me through how to prepare my nervous system and tactics for an upcoming competition." },
  { label: "Regulate", prompt: "I need to regulate right now. Tell me what state I'm likely in, then give me a guided breathing protocol using the breath block." },
  { label: "Reflect", prompt: "Ask me one sharp question to surface what I'm not seeing about my training this week." },
];

const SUGGESTED_PROMPTS = [
  "Debrief tonight's roll",
  "I fragmented under pressure today",
  "Walk me through a containment cycle",
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
  const url = attachmentFileUrl(att.id);
  return (
    <div className="relative inline-block border border-border/60 bg-black overflow-hidden">
      {att.kind === "image" ? (
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
          className="absolute top-1 right-1 w-6 h-6 bg-background/80 hover:bg-background border border-border/60 flex items-center justify-center text-foreground/85 hover:text-destructive transition-colors"
          aria-label="Remove attachment"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
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

  const [entryActive, setEntryActive] = useState(true);
  const [drafts, setDrafts] = useState<AttachmentDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEntryActive(true);
    setDrafts([]);
  }, [fighter?.id]);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const orbState = useMemo<"streaming" | "clean" | "idle">(
    () => (isStreaming ? "streaming" : messages.length > 0 ? "clean" : "idle"),
    [isStreaming, messages.length],
  );

  const orbLabel = isStreaming
    ? "Transmitting"
    : messages.length === 0
      ? "Dense calm"
      : "Coherent";

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

  const doSend = () => {
    if (isStreaming) return;
    if (!input.trim() && drafts.length === 0) return;
    sendMessage(input, drafts);
    setDrafts([]);
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
      <div className="flex flex-col h-[100dvh] bg-background text-foreground font-sans">
        <header className="flex-none flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border/60 bg-background/95 backdrop-blur-sm">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Frame</span>
          </Link>
          <div className="flex items-center gap-2">
            {fighter && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/80 mr-1">
                {fighter.name}
              </div>
            )}
            <NervousSystemOrb state={orbState} label={orbLabel} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reset()}
            className="text-muted-foreground hover:text-foreground font-mono text-[10px] uppercase tracking-widest -mr-2"
          >
            <RefreshCcw className="w-3 h-3 mr-1.5" />
            Reset
          </Button>
        </header>

        <div className="flex-none">
          <CompetitionBanner />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
            {isLoading ? (
              <div className="flex justify-center pt-20 text-muted-foreground font-mono text-xs uppercase tracking-widest">
                Loading state…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in duration-700">
                <div className="text-center space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Frame open
                  </div>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Talk to the coach. Debrief a session, request a drill, regulate, or reflect.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="text-left p-3.5 border border-border/60 hover:border-primary/50 transition-colors font-mono text-xs tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2 px-1">
                      {msg.role === "user" ? (fighter?.name ?? "Operator") : "Synochi"}
                    </div>
                    <div
                      className={
                        msg.role === "user"
                          ? "max-w-[90%] md:max-w-[80%] space-y-2"
                          : "max-w-full text-foreground"
                      }
                    >
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((a) => (
                            <AttachmentThumb key={a.id} att={a} />
                          ))}
                        </div>
                      )}
                      {msg.role === "assistant" && msg.pending && !msg.content ? (
                        <div className="flex items-center gap-3 py-2">
                          <FrameOctagon size={36} spin spinSeconds={4} />
                          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground synochi-typing-label">
                            sensing
                          </span>
                          <style>{`
                            @keyframes synochi-typing-fade {
                              0%, 100% { opacity: 0.5; }
                              50%      { opacity: 1; }
                            }
                            .synochi-typing-label { animation: synochi-typing-fade 1.8s ease-in-out infinite; }
                          `}</style>
                        </div>
                      ) : msg.role === "user" && msg.content ? (
                        <div className="text-foreground/90 px-4 py-3 border-l-2 border-border/70 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
                          {msg.content}
                        </div>
                      ) : msg.content ? (
                        <MessageContent
                          content={msg.content}
                          onTrain={(prompt) => {
                            if (!isStreaming) sendMessage(prompt);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
                {error && (
                  <div className="p-4 border border-destructive/40 bg-destructive/10 text-destructive/90 font-mono text-xs flex flex-col items-center gap-3 text-center">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => retry()}
                      disabled={isStreaming}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-destructive/50 text-destructive/90 hover:bg-destructive/15 uppercase tracking-widest disabled:opacity-40 transition-colors"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </main>

        <footer className="flex-none p-3 bg-background border-t border-border/40">
          <div className="max-w-3xl mx-auto space-y-3">
            {messages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    disabled={isStreaming}
                    onClick={() => sendMessage(qa.prompt)}
                    className="flex-none font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-40"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}

            {drafts.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1">
                {drafts.map((d) => (
                  <AttachmentThumb key={d.id} att={d} onRemove={() => removeDraft(d.id)} />
                ))}
              </div>
            )}

            {uploadError && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-destructive px-1">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                multiple
                onChange={handleFileChange}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isStreaming || !conversationId}
                className="flex-none h-[52px] w-11 flex items-center justify-center border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-40"
                aria-label="Attach image or video"
              >
                {uploading ? (
                  <FrameOctagon size={20} spin spinSeconds={3} glow={false} />
                ) : (
                  <Paperclip className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={listening ? "Listening..." : "Enter transmission..."}
                  className={`w-full bg-transparent border border-border/60 text-foreground placeholder:text-muted-foreground/70 placeholder:font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 resize-none min-h-[52px] max-h-[200px] py-3.5 pl-4 text-sm ${
                    voiceSupported ? "pr-[5.25rem]" : "pr-12"
                  }`}
                  rows={1}
                  disabled={isStreaming}
                />
                <div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5">
                  {voiceSupported && !isStreaming && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={toggleVoice}
                      aria-label={listening ? "Stop voice input" : "Speak your message"}
                      aria-pressed={listening}
                      className={`h-9 w-9 transition-colors ${
                        listening
                          ? "text-destructive hover:text-destructive hover:bg-destructive/10 frame-mic-live"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      <Mic className="w-4 h-4" strokeWidth={1.5} />
                    </Button>
                  )}
                  {isStreaming ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={stop}
                      className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      disabled={!canSend}
                      className="h-9 w-9 text-primary hover:text-primary hover:bg-primary/10"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </form>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 justify-center pt-1">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.prompt)}
                    className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>

        <BottomNav />
      </div>
    </>
  );
}
