import { useState, useEffect, useRef } from "react";
import { useChat, Message } from "@/hooks/use-chat";
import { Send, Square, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTED_PROMPTS = [
  "Debrief tonight's roll",
  "I fragmented under pressure today",
  "Walk me through a containment cycle",
  "What's my next rep on the half-guard pass?",
  "Check my approach velocity"
];

const parseText = (text: string) => {
  // A simple markdown + double bracket parser
  // First split by double brackets
  const parts = text.split(/(\[\[.*?\]\])/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const concept = part.slice(2, -2);
      return <span key={i} className="synochi-concept">{concept}</span>;
    }
    
    // Simple bold
    const boldParts = part.split(/(\*\*.*?\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith('**') && bp.endsWith('**')) {
        return <strong key={`${i}-${j}`} className="font-semibold text-foreground">{bp.slice(2, -2)}</strong>;
      }
      return bp;
    });
  });
};

const renderMessageContent = (content: string) => {
  // Split by paragraphs
  const paragraphs = content.split('\n\n').filter(Boolean);
  
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => {
        // Simple list support
        if (p.trim().startsWith('- ') || p.trim().startsWith('* ')) {
          const items = p.split('\n').filter(line => line.trim().startsWith('- ') || line.trim().startsWith('* '));
          return (
            <ul key={i} className="list-disc pl-4 space-y-1.5 opacity-90 text-[0.95rem]">
              {items.map((item, j) => (
                <li key={j}>{parseText(item.replace(/^[-*]\s/, ''))}</li>
              ))}
            </ul>
          );
        }
        
        return <p key={i} className="leading-relaxed opacity-90 text-[0.95rem]">{parseText(p)}</p>;
      })}
    </div>
  );
};

export default function ChatPage() {
  const { messages, input, setInput, isStreaming, error, sendMessage, stop, clearChat } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      sendMessage(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground font-sans">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/95 backdrop-blur-sm z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-primary" />
          <h1 className="font-mono font-bold text-sm tracking-wider uppercase text-foreground/80">Synochi</h1>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={clearChat}
          className="text-muted-foreground hover:text-foreground font-mono text-xs uppercase tracking-widest"
        >
          <RefreshCcw className="w-3 h-3 mr-2" />
          Reset
        </Button>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-2xl mx-auto py-8 space-y-8 pb-32">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-700">
              <div className="w-12 h-12 border border-primary/20 flex items-center justify-center bg-primary/5">
                <div className="w-2 h-2 bg-primary animate-pulse" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left p-4 border border-border/50 bg-secondary/30 hover:bg-secondary/80 hover:border-primary/50 transition-colors font-mono text-xs tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2 px-1">
                    {msg.role === "user" ? "Operator" : "Synochi"}
                  </div>
                  <div 
                    className={`max-w-[90%] md:max-w-[85%] ${
                      msg.role === "user" 
                        ? "bg-secondary text-secondary-foreground px-5 py-3 border-l-2 border-primary/30" 
                        : "text-foreground pr-4"
                    }`}
                  >
                    {msg.role === "assistant" && !msg.content && isStreaming ? (
                      <div className="flex items-center h-6">
                        <div className="w-1.5 h-3 bg-primary animate-pulse" />
                      </div>
                    ) : (
                      renderMessageContent(msg.content)
                    )}
                  </div>
                </div>
              ))}
              {error && (
                <div className="p-4 border border-destructive/30 bg-destructive/10 text-destructive font-mono text-sm text-center">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="flex-none p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent border-t border-border/20 fixed bottom-0 w-full">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative flex items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter transmission..."
              className="w-full bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground placeholder:font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none min-h-[56px] max-h-[200px] py-4 pl-4 pr-16 text-sm"
              rows={1}
              disabled={isStreaming}
            />
            <div className="absolute right-2 bottom-2">
              {isStreaming ? (
                <Button 
                  type="button" 
                  size="icon" 
                  variant="ghost" 
                  onClick={stop}
                  className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Square className="w-4 h-4 fill-current" />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  size="icon" 
                  variant="ghost"
                  disabled={!input.trim()}
                  className="h-10 w-10 text-primary hover:text-primary hover:bg-primary/10"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </footer>
    </div>
  );
}
