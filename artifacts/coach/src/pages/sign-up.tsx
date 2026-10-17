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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);

  const signupConsentStatus: AiConsentStatus = {
    accepted: false,
    version: AI_CONSENT_VERSION,
    acceptedAt: null,
    disclosure: AI_CONSENT_DISCLOSURE,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !acceptedLegal) return;
    setError(null);
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
          email,
          password,
          acceptedTerms: acceptedLegal,
          acceptedPrivacy: acceptedLegal,
          acceptedAiConsent: true,
          aiConsentVersion: AI_CONSENT_VERSION,
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

  return (
    <AuthLayout compact>
      <div className="glass glass-clear w-full px-5 pb-3 pt-5">
        <h1 className="display-title">Create your account</h1>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="label">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-invalid={error ? true : undefined}
              className="field-glass"
            />
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
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              className="field-glass"
            />
            <span className="text-xs text-[var(--f-text-3)]">Minimum 8 characters</span>
          </div>

          <label className="flex min-h-[44px] items-start gap-3 text-sm leading-5 text-[var(--f-text-2)]">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => setAcceptedLegal(e.target.checked)}
              required
              className="mt-0.5 h-5 w-5 flex-none accent-[#B9A477]"
            />
            <span>
              I accept the{" "}
              <a href={`${basePath}/api/terms`} target="_blank" rel="noreferrer" className="text-[var(--f-gold)] underline underline-offset-2">Terms of Service</a>
              {" "}and{" "}
              <a href={`${basePath}/api/privacy`} target="_blank" rel="noreferrer" className="text-[var(--f-gold)] underline underline-offset-2">Privacy Policy and AI data-use disclosure</a>.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-[var(--f-red-text)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password || !acceptedLegal}
            data-loading={loading ? "true" : undefined}
            className="btn-bronze w-full"
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
