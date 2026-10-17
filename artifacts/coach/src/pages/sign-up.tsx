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
    <AuthLayout>
      <div className="glass glass-clear w-full max-w-[420px] overflow-hidden">
        <div aria-hidden className="glow-orb -right-20 -top-24 h-52 w-52 opacity-70" />
        <div className="relative px-7 pt-9 pb-7">
          <div className="mb-7 text-center">
            <h1 className="punch !text-[clamp(2.8rem,15vw,3.8rem)]">Join Frame</h1>
            <div className="eyebrow eyebrow-gold mt-3">Create your account</div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="signup-email" className="eyebrow pl-1">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="field-glass"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="signup-password" className="eyebrow pl-1">
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
                className="field-glass"
              />
              <span className="pl-1 text-xs text-muted-foreground">
                Minimum 8 characters
              </span>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-foreground/80">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                required
                className="mt-0.5 h-5 w-5 flex-none accent-[hsl(var(--primary))]"
              />
              <span>
                I accept the{" "}
                <a href={`${basePath}/api/terms`} target="_blank" rel="noreferrer" className="text-[hsl(var(--primary-light))] underline underline-offset-2">Terms of Service</a>
                {" "}and{" "}
                <a href={`${basePath}/api/privacy`} target="_blank" rel="noreferrer" className="text-[hsl(var(--primary-light))] underline underline-offset-2">Privacy Policy and AI data-use disclosure</a>.
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-[#E0564E]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password || !acceptedLegal}
              className="btn-bronze mt-1 w-full"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <div className="relative border-t border-white/10 px-7 py-2 text-center">
          <span className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <a
              href={`${basePath}/sign-in`}
              className="inline-flex min-h-[44px] items-center font-medium text-[hsl(var(--primary-light))] transition-colors hover:text-[hsl(var(--primary-pale))]"
            >
              Sign in
            </a>
          </span>
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
