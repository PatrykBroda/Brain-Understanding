import { useState } from "react";
import type { AiConsentStatus } from "@/lib/api";

export function AiConsentModal({
  status,
  busy,
  mandatory,
  onAccept,
  onDecline,
  onSignOut,
  onDeleteAccount,
}: {
  status: AiConsentStatus;
  busy: boolean;
  mandatory?: boolean;
  onAccept: () => void;
  onDecline?: () => void;
  onSignOut?: () => void;
  onDeleteAccount?: () => void;
}) {
  const disclosure = status.disclosure;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={
        mandatory
          ? "fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-background p-0 sm:p-4"
          : "fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-4"
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      onClick={!busy && !mandatory && onDecline ? onDecline : undefined}
    >
      <div
        className={
          mandatory
            ? "w-full max-w-lg overflow-y-auto bg-background p-6 max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] sm:border sm:border-border sm:p-8"
            : "w-full max-w-lg overflow-y-auto border border-border bg-background p-6 shadow-2xl max-h-[90dvh] sm:max-h-[calc(100dvh-2rem)] sm:p-8"
        }
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

        {mandatory ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            FRAME is an AI-powered system. You must grant permission to continue.
            If you do not agree, you can sign out or permanently delete your account.
          </p>
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            FRAME is an AI-powered system. You must grant permission to use this feature.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <a
            href="/api/privacy"
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:underline"
          >
            Read the privacy policy
          </a>
          <a
            href="/api/terms"
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:underline"
          >
            Read the terms of service
          </a>
        </div>

        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="mt-6 w-full border border-primary bg-primary/90 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-primary-foreground transition-colors hover:bg-primary disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? "Saving permission…" : "Agree & Continue"}
        </button>

        {mandatory ? (
          <div className="mt-2 flex flex-col gap-2">
            {onSignOut && !confirmDelete && (
              <button
                type="button"
                onClick={onSignOut}
                disabled={busy}
                className="w-full px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Sign out
              </button>
            )}
            {onDeleteAccount && (
              confirmDelete ? (
                <div className="mt-4 flex flex-col gap-2 border border-destructive/40 bg-destructive/5 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-destructive mb-2 text-center">
                    Permanently delete account?
                  </p>
                  <button
                    type="button"
                    onClick={onDeleteAccount}
                    disabled={busy}
                    className="w-full bg-destructive px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-wait disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="w-full px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="w-full px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-destructive/70 transition-colors hover:text-destructive disabled:opacity-50"
                >
                  Delete account
                </button>
              )
            )}
          </div>
        ) : (
          onDecline && (
            <button
              type="button"
              onClick={onDecline}
              disabled={busy}
              className="mt-2 w-full px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Not now
            </button>
          )
        )}
      </div>
    </div>
  );
}