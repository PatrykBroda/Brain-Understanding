import { useState } from "react";
import { useLocation } from "wouter";
import AuthLayout from "@/components/auth-layout";
import { useAuth } from "@/context/auth-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
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
      <div className="glass glass-clear w-full px-5 pb-4 pt-6">
        <h1 className="display-title">Sign in</h1>
        <p className="label mt-1">Welcome back</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signin-email" className="label">
              Email
            </label>
            <input
              id="signin-email"
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
            <label htmlFor="signin-password" className="label">
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-invalid={error ? true : undefined}
              className="field-glass"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--f-red-text)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            data-loading={loading ? "true" : undefined}
            className="btn-bronze w-full data-[loading=true]:!opacity-100"
          >
            Sign in
          </button>
        </form>

        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>New to FRAME?</span>
          <a
            href={`${basePath}/sign-up`}
            className="inline-flex min-h-[44px] items-center font-semibold text-[var(--f-gold)] transition-colors hover:text-[var(--f-gold-pale)]"
          >
            Create account
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}
