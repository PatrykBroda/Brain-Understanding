import { useState } from "react";
import { formatProviderList, type AiConsentDisclosure } from "@workspace/ai-consent";
import type { AiConsentStatus } from "@/lib/api";

export function AiConsentModal({
  status,
  busy,
  mandatory,
  onAccept,
  onDecline,
  onSignOut,
  onDeleteAccount,
  signup = false,
  disclosure: disclosureOverride,
}: {
  status: AiConsentStatus;
  busy: boolean;
  mandatory?: boolean;
  onAccept: () => void;
  onDecline?: () => void;
  onSignOut?: () => void;
  onDeleteAccount?: () => void;
  signup?: boolean;
  disclosure?: AiConsentDisclosure;
}) {
  const disclosure = disclosureOverride ?? status.disclosure;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checked, setChecked] = useState(false);

  return (
    <div
      className={
        mandatory
          ? "frame-ambient fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-0 sm:p-4"
          : "fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#050505]/80 p-0 backdrop-blur-md sm:p-4"
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      onClick={!busy && !mandatory && onDecline ? onDecline : undefined}
    >
      <div
        className={
          mandatory
            ? "glass w-full max-w-lg overflow-y-auto rounded-none p-6 max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem] sm:p-8"
            : "glass w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-[2rem] p-6 max-h-[90dvh] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem] sm:p-8"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="eyebrow eyebrow-gold">
          Your data · your choice
        </div>
        <h2
          id="ai-consent-title"
          className="display-heading mt-2 !text-[2rem]"
        >
          AI coaching permission
        </h2>
        <p className="mt-5 text-sm leading-relaxed text-foreground/80">
          FRAME uses {formatProviderList(disclosure.providers)} for AI features.
          The exact categories below come from the FRAME server disclosure.
          Nothing is sent to these providers before you agree.
        </p>

        <h3 className="eyebrow mt-7">
          What may be sent
        </h3>
        <ul className="mt-3 space-y-2">
          {disclosure.sharedData.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
              <span className="text-[hsl(var(--primary-light))]" aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <h3 className="eyebrow mt-7">
          What is not sent
        </h3>
        <ul className="mt-3 space-y-2">
          {disclosure.notShared.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
              <span className="text-[hsl(var(--primary-light))]" aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {disclosure.purpose ? (
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{disclosure.purpose}</p>
        ) : null}

        {mandatory ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            FRAME is an AI-powered system. You must grant permission to continue.
            If you do not agree, you can sign out or permanently delete your account.
          </p>
        ) : signup ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            FRAME is an AI-powered system. Your account is not created unless you agree.
          </p>
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            FRAME is an AI-powered system. You must grant permission to use this feature.
          </p>
        )}

        <div className="mt-3 flex flex-col">
          <a
            href="/api/privacy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center text-[11px] font-medium uppercase tracking-[0.16em] text-[hsl(var(--primary-light))] hover:underline"
          >
            Read the privacy policy
          </a>
          <a
            href="/api/terms"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center text-[11px] font-medium uppercase tracking-[0.16em] text-[hsl(var(--primary-light))] hover:underline"
          >
            Read the terms of service
          </a>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground/75">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            disabled={busy}
            className="mt-1 h-5 w-5 accent-[hsl(var(--primary))]"
          />
          <span>
            I understand and agree to the sending of my data to{" "}
            {formatProviderList(disclosure.providers)} for the purposes described above.
          </span>
        </label>

        <button
          type="button"
          onClick={onAccept}
          disabled={busy || !checked}
          className="btn-bronze mt-6 w-full disabled:cursor-wait"
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
                className="min-h-[44px] w-full px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Sign out
              </button>
            )}
            {onDeleteAccount && (
              confirmDelete ? (
                <div className="mt-4 flex flex-col gap-2 rounded-3xl border border-[#E0564E]/40 bg-destructive/10 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#E0564E] mb-2 text-center">
                    Permanently delete account?
                  </p>
                  <button
                    type="button"
                    onClick={onDeleteAccount}
                    disabled={busy}
                    className="min-h-[48px] w-full rounded-full bg-destructive px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-wait disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="min-h-[44px] w-full px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="min-h-[44px] w-full px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[#E0564E] transition-colors hover:text-[#f0786f] disabled:opacity-50"
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
              className="mt-2 min-h-[44px] w-full px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {signup ? "Go back" : "Not now"}
            </button>
          )
        )}
      </div>
    </div>
  );
}