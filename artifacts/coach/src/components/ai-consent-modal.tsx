import { useState } from "react";
import { createPortal } from "react-dom";
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

  // Portal to <body>: on the sign-up page the modal sat inside a backdrop-filter ancestor, which
  // turns `fixed inset-0` into "fill that ancestor" - on desktop the panel was clipped below the fold.
  return createPortal(
    <div
      className={
        mandatory
          ? "fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-[#08090B] p-0 sm:p-4"
          : "fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#08090B]/80 p-0 backdrop-blur-md sm:p-4"
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      onClick={!busy && !mandatory && onDecline ? onDecline : undefined}
    >
      <div
        className={
          mandatory
            ? "overlay-surface !bg-[#191C20] w-full max-w-lg overflow-y-auto !rounded-none p-6 max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] sm:!rounded-[20px] sm:p-8"
            : "overlay-surface !bg-[#191C20] w-full max-w-lg overflow-y-auto !rounded-b-none !rounded-t-[20px] p-6 max-h-[90dvh] sm:max-h-[calc(100dvh-2rem)] sm:!rounded-[20px] sm:p-8"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="label !text-[#B9A477]">Your data, your choice</div>
        <h2
          id="ai-consent-title"
          className="display-title mt-2"
        >
          AI coaching permission
        </h2>
        <p className="mt-4 text-[1rem] leading-[1.6] text-foreground/85">
          FRAME uses {formatProviderList(disclosure.providers)} for AI features.
          The exact categories below come from the FRAME server disclosure.
          Nothing is sent to these providers before you agree.
        </p>

        <h3 className="section-title !text-[1.0625rem] mt-6">
          What may be sent
        </h3>
        <ul className="mt-3 space-y-2">
          {disclosure.sharedData.map((item) => (
            <li key={item} className="flex gap-2.5 text-[0.9375rem] leading-[1.55] text-foreground/85">
              <span className="text-[#B9A477]" aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <h3 className="section-title !text-[1.0625rem] mt-6">
          What is not sent
        </h3>
        <ul className="mt-3 space-y-2">
          {disclosure.notShared.map((item) => (
            <li key={item} className="flex gap-2.5 text-[0.9375rem] leading-[1.55] text-foreground/85">
              <span className="text-[#B9A477]" aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {disclosure.purpose ? (
          <p className="mt-5 text-[0.875rem] leading-[1.55] text-muted-foreground">{disclosure.purpose}</p>
        ) : null}

        {mandatory ? (
          <p className="mt-4 text-[0.875rem] leading-[1.55] text-muted-foreground">
            FRAME is an AI-powered system. You must grant permission to continue.
            If you do not agree, you can sign out or permanently delete your account.
          </p>
        ) : signup ? (
          <p className="mt-4 text-[0.875rem] leading-[1.55] text-muted-foreground">
            FRAME is an AI-powered system. Your account is not created unless you agree.
          </p>
        ) : (
          <p className="mt-4 text-[0.875rem] leading-[1.55] text-muted-foreground">
            FRAME is an AI-powered system. You must grant permission to use this feature.
          </p>
        )}

        <div className="mt-3 flex flex-col">
          <a
            href="/api/privacy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center text-[0.9375rem] font-medium text-[#D4C7A3] underline underline-offset-4 decoration-white/20 hover:decoration-[#D4C7A3]"
          >
            Read the privacy policy
          </a>
          <a
            href="/api/terms"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center text-[0.9375rem] font-medium text-[#D4C7A3] underline underline-offset-4 decoration-white/20 hover:decoration-[#D4C7A3]"
          >
            Read the terms of service
          </a>
        </div>

        {/* Pinned so the agree checkbox and button are always on screen, not a screen and a half down. */}
        <div className="sticky -bottom-6 z-10 -mx-6 mt-6 border-t border-[var(--f-border)] bg-[#191C20] px-6 pb-5 pt-4 sm:-bottom-8 sm:-mx-8 sm:px-8 sm:pb-6">
          <label className="flex cursor-pointer items-start gap-3 text-[0.9375rem] leading-[1.55] text-foreground/85">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              disabled={busy}
              className="mt-0.5 h-5 w-5 flex-none accent-[#B9A477]"
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
            className="btn-bronze mt-4 w-full disabled:cursor-wait"
          >
            {busy ? "Saving permission…" : "Agree & Continue"}
          </button>
        </div>

        {mandatory ? (
          <div className="mt-2 flex flex-col gap-2">
            {onSignOut && !confirmDelete && (
              <button
                type="button"
                onClick={onSignOut}
                disabled={busy}
                className="btn-quiet !border-transparent w-full text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Sign out
              </button>
            )}
            {onDeleteAccount && (
              confirmDelete ? (
                <div className="mt-4 flex flex-col gap-2 rounded-[16px] border border-[#E5645A]/40 bg-[#E5645A]/10 p-4">
                  <p className="text-[0.9375rem] font-medium text-[#E5645A] mb-2 text-center">
                    Permanently delete account?
                  </p>
                  <button
                    type="button"
                    onClick={onDeleteAccount}
                    disabled={busy}
                    className="min-h-[48px] w-full rounded-[14px] bg-[#E5645A] px-4 py-3 text-[1rem] font-semibold text-[#0B0C0E] transition-colors hover:bg-[#EE7C72] disabled:cursor-wait disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="btn-quiet !border-transparent w-full text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="btn-quiet !border-transparent w-full !text-[#E5645A] disabled:opacity-50"
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
              className="mt-2 btn-quiet !border-transparent w-full text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {signup ? "Go back" : "Not now"}
            </button>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}