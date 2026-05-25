import { useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { Send, Square, RefreshCcw, ChevronLeft } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useFighter } from "@/hooks/use-fighter";
import { useAnswerCalibration, useNextCalibration } from "@/hooks/use-calibration";
import { MessageContent } from "@/components/message-content";
import { NervousSystemOrb } from "@/components/nervous-system-orb";
import { CalibrationCard } from "@/components/calibration-card";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Analyse session", prompt: "Debrief my last training session — what fragmented, what held, what's the next rep." },
  { label: "Build drill", prompt: "Prescribe me a drill for my biggest current weakness. Use the drill block." },
  { label: "Fix my game", prompt: "Diagnose the recurring leak in my game right now and tell me the protocol to close it." },
  { label: "Competition prep", prompt: "Walk me through how to prepare my nervous system and tactics for an upcoming competition." },
  { label: "Regulate", prompt: "I need a regulation protocol right now. Tell me what state I'm likely in and what to do." },
  { label: "Reflect", prompt: "Ask me one sharp question to surface what I'm not seeing about my training this week." },
];

const SUGGESTED_PROMPTS = [
  "Debrief tonight's roll",
  "I fragmented under pressure today",
  "Walk me through a containment cycle",
  "What's my next rep on the half-guard pass?",
];

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
    sendMessage,
    stop,
    reset,
    userTurnsThisSession,
    bumpCalibrationCounter,
  } = useChat();

  const enableCalibration = messages.length >= 2 && userTurnsThisSession >= 3 && !isStreaming;
  const calibrationQuery = useNextCalibration(enableCalibration);
  const answerCalibration = useAnswerCalibration();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, calibrationQuery.data]);

  const orbState = useMemo<"streaming" | "clean" | "idle">(
    () => (isStreaming ? "streaming" : messages.length > 0 ? "clean" : "idle"),
    [isStreaming, messages.length],
  );

  const orbLabel = isStreaming
    ? "Transmitting"
    : messages.length === 0
      ? "Dense calm"
      : "Coherent";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
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
                    className="text-left p-3.5 border border-border/60 bg-secondary/30 hover:bg-secondary/70 hover:border-primary/50 transition-colors font-mono text-xs tracking-wide text-muted-foreground hover:text-foreground"
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
                        ? "max-w-[90%] md:max-w-[80%] bg-secondary/70 text-secondary-foreground px-4 py-3 border-l-2 border-primary/40"
                        : "max-w-full text-foreground"
                    }
                  >
                    {msg.role === "assistant" && msg.pending && !msg.content ? (
                      <div className="flex items-center gap-2 h-6">
                        <div className="w-1.5 h-3 bg-primary animate-pulse" />
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          sensing
                        </span>
                      </div>
                    ) : (
                      <MessageContent content={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              {error && (
                <div className="p-4 border border-destructive/40 bg-destructive/10 text-destructive/90 font-mono text-xs text-center">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </main>

      <footer className="flex-none p-3 bg-background border-t border-border/40">
        <div className="max-w-3xl mx-auto space-y-3">
          {enableCalibration && calibrationQuery.data?.question && (
            <CalibrationCard
              question={calibrationQuery.data.question}
              pending={answerCalibration.isPending}
              onAnswer={(answer) => {
                const key = calibrationQuery.data!.question!.key;
                answerCalibration.mutate({ key, answer });
                bumpCalibrationCounter();
              }}
              onDismiss={bumpCalibrationCounter}
            />
          )}

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

          <form onSubmit={handleSubmit} className="relative flex items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter transmission..."
              className="w-full bg-secondary/50 border border-border/60 text-foreground placeholder:text-muted-foreground/70 placeholder:font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 resize-none min-h-[52px] max-h-[200px] py-3.5 pl-4 pr-12 text-sm"
              rows={1}
              disabled={isStreaming}
            />
            <div className="absolute right-1.5 bottom-1.5">
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
                  disabled={!input.trim()}
                  className="h-9 w-9 text-primary hover:text-primary hover:bg-primary/10"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
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
  );
}
