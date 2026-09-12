import type { AiConsentStatus } from "@/lib/api";

export function AiConsentModal({
  status,
  busy,
  onAccept,
  onDecline,
}: {
  status: AiConsentStatus;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const disclosure = status.disclosure;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      onClick={busy ? undefined : onDecline}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border border-border bg-background p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-primary">
          Your data · your choice
        </div>
        <h2
          id="ai-consent-title"
          className="mt-2 text-2xl font-light uppercase tracking-[0.12em] text-foreground"
        >
          AI coaching permission
        </h2>
        <p className="mt-5 text-sm leading-relaxed text-foreground/75">
          FRAME uses Anthropic (Claude) and OpenAI services for AI coaching. The
          exact categories below come from the FRAME server disclosure. Nothing
          is sent to either Anthropic/Claude or OpenAI before you agree.
        </p>

        <h3 className="mt-7 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          What may be sent
        </h3>
        <ul className="mt-3 space-y-2">
          {disclosure.sharedData.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-foreground/70">
              <span className="text-primary" aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <h3 className="mt-7 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          What is not sent
        </h3>
        <ul className="mt-3 space-y-2">
          {disclosure.notShared.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-foreground/70">
              <span className="text-primary" aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {disclosure.purpose ? (
          <p className="mt-5 text-xs leading-relaxed text-foreground/60">{disclosure.purpose}</p>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          You can decline and keep using non-AI features. You can withdraw
          permission from Profile at any time.
        </p>
        <a
          href="/api/privacy"
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:underline"
        >
          Read the privacy policy
        </a>

        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="mt-6 w-full border border-primary bg-primary/90 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-primary-foreground transition-colors hover:bg-primary disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? "Saving permission…" : "Agree & Continue"}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="mt-2 w-full px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}