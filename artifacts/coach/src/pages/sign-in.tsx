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
      <div className="glass glass-clear w-full max-w-[420px] overflow-hidden">
        <div aria-hidden className="glow-orb -right-20 -top-24 h-52 w-52 opacity-70" />
        <div className="relative px-7 pt-9 pb-7">
          <div className="mb-8 text-center">
            <h1 className="punch punch-xl !text-[clamp(3.4rem,18vw,4.6rem)]">Sign in</h1>
            <div className="eyebrow eyebrow-gold mt-3">Welcome back</div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="signin-email" className="eyebrow pl-1">
                Email
              </label>
              <input
                id="signin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="field-glass"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="signin-password" className="eyebrow pl-1">
                Password
              </label>
              <input
                id="signin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="field-glass"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-[#E5645A]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn-bronze mt-1 w-full"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="relative border-t border-white/10 px-7 py-2 text-center">
          <span className="text-sm text-muted-foreground">
            No account?{" "}
            <a
              href={`${basePath}/sign-up`}
              className="inline-flex min-h-[44px] items-center font-medium text-[hsl(var(--primary-light))] transition-colors hover:text-[hsl(var(--primary-pale))]"
            >
              Create one
            </a>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
}
