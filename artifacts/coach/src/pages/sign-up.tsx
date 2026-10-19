import { useState } from "react";
import { useLocation } from "wouter";
import AuthLayout from "@/components/auth-layout";
import { useAuth } from "@/context/auth-context";
import {
  AI_CONSENT_DISCLOSURE,
  AI_CONSENT_VERSION,
} from "@workspace/ai-consent";
import { AiConsentModal } from "@/components/ai-consent-modal";
import type { AiConsentStatus } from "@/lib/api";
import { NAME_MAX, validateSignUp } from "@/lib/onboarding-form";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const signupConsentStatus: AiConsentStatus = {
    accepted: false,
    version: AI_CONSENT_VERSION,
    acceptedAt: null,
    disclosure: AI_CONSENT_DISCLOSURE,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setAttempted(true);
    setError(null);
    if (Object.keys(validateSignUp({ name, email, password, acceptedLegal })).length > 0) return;
    setShowAiConsent(true);
  }

  async function createAccount() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Sign-up asks for name, email and password only; onboarding starts from this name.
          name: name.trim(),
          email: email.trim(),
          password,
          acceptedTerms: acceptedLegal,
          acceptedPrivacy: acceptedLegal,
          acceptedAiConsent: true,
          aiConsentVersion: AI_CONSENT_VERSION,
          // Funnel: lets the server record "account created" against this app.
          app: "coach",
        }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-up failed");
        return;
      }
      signIn(data.token!);
      setLocation("/home", { replace: true });
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const problems = validateSignUp({ name, email, password, acceptedLegal });
  const nameErr = attempted ? problems.name : undefined;
  const emailErr = attempted ? problems.email : undefined;
  const passwordErr = password.length > 0 || attempted ? problems.password : undefined;
  const legalErr = attempted ? problems.legal : undefined;

  return (
    <AuthLayout compact>
      <div className="glass glass-clear w-full px-5 pb-3 pt-5">
        <h1 className="display-title">Create your account</h1>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-name" className="label">
              Name
            </label>
            <input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={NAME_MAX}
              placeholder="What should we call you?"
              aria-invalid={nameErr ? true : undefined}
              aria-describedby={nameErr ? "signup-name-err" : undefined}
              className="field-glass"
            />
            {nameErr && (
              <span id="signup-name-err" role="alert" className="text-xs text-[var(--f-red-text)]">
                {nameErr}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="label">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={emailErr || error ? true : undefined}
              aria-describedby={emailErr ? "signup-email-err" : undefined}
              className="field-glass"
            />
            {emailErr && (
              <span id="signup-email-err" role="alert" className="text-xs text-[var(--f-red-text)]">
                {emailErr}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-password" className="label">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={passwordErr || error ? true : undefined}
              aria-describedby="signup-password-hint"
              className="field-glass"
            />
            <span
              id="signup-password-hint"
              role={passwordErr ? "alert" : undefined}
              className={`text-xs ${passwordErr ? "text-[var(--f-red-text)]" : "text-[var(--f-text-3)]"}`}
            >
              {passwordErr ?? "Minimum 8 characters"}
            </span>
          </div>

          <label className="flex min-h-[44px] items-start gap-3 text-sm leading-5 text-[var(--f-text-2)]">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => setAcceptedLegal(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-[#B9A477]"
            />
            <span>
              I accept the{" "}
              <a href={`${basePath}/api/terms`} target="_blank" rel="noreferrer" className="text-[var(--f-gold)] underline underline-offset-2">Terms of Service</a>
              {" "}and{" "}
              <a href={`${basePath}/api/privacy`} target="_blank" rel="noreferrer" className="text-[var(--f-gold)] underline underline-offset-2">Privacy Policy and AI data-use disclosure</a>.
            </span>
          </label>

          {legalErr && (
            <p role="alert" className="-mt-2 text-sm text-[var(--f-red-text)]">
              {legalErr}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-[var(--f-red-text)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            data-loading={loading ? "true" : undefined}
            className="btn-bronze w-full data-[loading=true]:!opacity-100"
          >
            Create account
          </button>
        </form>

        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Already have an account?</span>
          <a
            href={`${basePath}/sign-in`}
            className="inline-flex min-h-[44px] items-center font-semibold text-[var(--f-gold)] transition-colors hover:text-[var(--f-gold-pale)]"
          >
            Sign in
          </a>
        </div>
      </div>
      {showAiConsent && (
        <AiConsentModal
          status={signupConsentStatus}
          disclosure={AI_CONSENT_DISCLOSURE}
          signup
          busy={loading}
          onAccept={() => void createAccount()}
          onDecline={() => {
            if (!loading) setShowAiConsent(false);
          }}
        />
      )}
    </AuthLayout>
  );
}
