import { useState } from "react";
import { useLocation } from "wouter";
import AuthLayout from "@/components/auth-layout";
import { useAuth } from "@/context/auth-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
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
      const res = await fetch(`${basePath}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
      <div className="w-full max-w-[400px] bg-[hsl(0,0%,6%)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-8 pt-8 pb-6">
          <div className="mb-6 text-center">
            <div className="font-mono text-[15px] uppercase tracking-[0.18em] text-foreground/95 font-light">
              Create your FRAME account
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55 mt-1.5">
              Calibration system
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/70">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-[hsl(0,0%,9%)] border border-white/[0.08] text-foreground placeholder:text-foreground/30 px-3 py-2.5 rounded-md focus:border-primary/40 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/70">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-[hsl(0,0%,9%)] border border-white/[0.08] text-foreground placeholder:text-foreground/30 px-3 py-2.5 rounded-md focus:border-primary/40 focus:outline-none transition-colors"
              />
              <span className="font-mono text-[9px] text-foreground/40 tracking-wide">
                Minimum 8 characters
              </span>
            </div>

            {error && (
              <p className="font-mono text-[11px] tracking-wide text-[hsl(0,72%,62%)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="bg-primary text-black font-mono uppercase tracking-[0.25em] text-[11px] py-3 rounded-md hover:bg-primary/90 transition-colors shadow-[0_8px_30px_-10px_hsla(39,49%,36%,0.4)] disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <div className="px-8 py-4 border-t border-white/[0.06] text-center">
          <span className="font-mono text-[11px] text-foreground/55">
            Already have an account?{" "}
            <a
              href={`${basePath}/sign-in`}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              Sign in
            </a>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
}
