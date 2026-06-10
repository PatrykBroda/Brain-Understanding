import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import OnboardingPage from "@/pages/onboarding";
import HomePage from "@/pages/home";
import ProfilePage from "@/pages/profile";
import PlannerPage from "@/pages/planner";
import AnalysePage from "@/pages/analyse";
import CompetitionPage from "@/pages/competition";
import SplashPage from "@/pages/splash";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import PublicLandingPage from "@/pages/landing";
import { useFighter } from "@/hooks/use-fighter";
import { ApiError } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Compute the Clerk proxy URL at runtime from window.location so it always
// resolves to the correct domain without requiring VITE_CLERK_PROXY_URL to be
// set as a build-time secret. The proxy middleware is a no-op in dev instances,
// so only activate it on production domains (*.replit.app / custom domains).
const isDevDomain =
  window.location.hostname === "localhost" ||
  window.location.hostname.endsWith(".replit.dev");
const clerkProxyUrl = isDevDomain
  ? undefined
  : `${window.location.origin}/api/__clerk`;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(35, 65%, 55%)",
    colorForeground: "hsl(0, 0%, 92%)",
    colorMutedForeground: "hsl(0, 0%, 58%)",
    colorDanger: "hsl(0, 72%, 55%)",
    colorBackground: "hsl(0, 0%, 4%)",
    colorInput: "hsl(0, 0%, 7%)",
    colorInputForeground: "hsl(0, 0%, 95%)",
    colorNeutral: "hsl(0, 0%, 18%)",
    fontFamily: "'Outfit', system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[hsl(0,0%,6%)] border border-white/[0.06] rounded-2xl w-full max-w-[400px] overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:
      "text-foreground/95 font-light tracking-[0.18em] uppercase text-[15px]",
    headerSubtitle: "text-foreground/55 font-mono text-[11px] tracking-[0.18em] uppercase",
    socialButtonsBlockButton:
      "bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.14] text-foreground/90 transition-colors duration-300 py-2.5",
    socialButtonsBlockButtonText: "text-foreground/90 font-sans tracking-wide",
    formFieldLabel:
      "text-foreground/70 font-mono text-[10px] uppercase tracking-[0.25em]",
    formFieldInput:
      "bg-[hsl(0,0%,9%)] border border-white/[0.08] text-foreground placeholder:text-foreground/30 transition-colors duration-200 focus:border-primary/40 focus:ring-0 focus:outline-none py-2.5",
    formButtonPrimary:
      "bg-primary text-black hover:bg-primary/90 font-mono uppercase tracking-[0.25em] text-[11px] py-3 transition-colors duration-300 shadow-[0_8px_30px_-10px_hsla(35,65%,55%,0.4)]",
    footerActionLink: "text-primary hover:text-primary/80 transition-colors",
    footerActionText: "text-foreground/55",
    footerAction: "bg-transparent",
    dividerLine: "bg-white/[0.08]",
    dividerText: "text-foreground/45 font-mono text-[10px] uppercase tracking-[0.3em]",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formFieldSuccessText: "text-primary",
    formFieldErrorText: "text-[hsl(0,72%,62%)] font-mono text-[11px] tracking-wide",
    formResendCodeLink: "text-primary hover:text-primary/80 font-mono text-[11px] tracking-wide",
    alertText: "text-foreground/90",
    alert:
      "bg-white/[0.03] border border-white/[0.08] text-foreground/90",
    otpCodeFieldInput:
      "bg-[hsl(0,0%,9%)] border border-white/[0.08] text-foreground rounded-lg transition-colors duration-200 focus:border-primary/50 focus:ring-0 focus:outline-none",
    logoBox: "flex justify-center pt-2 pb-1",
    logoImage: "h-10 w-auto",
    main: "gap-5",
    form: "gap-4",
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function SplashGate({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    try {
      if (sessionStorage.getItem("frame:splash-seen") !== "1") {
        setLocation("/splash", { replace: true });
      }
    } catch {
      // sessionStorage blocked — skip splash, fall through to home
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useFighter();
  const { signOut } = useClerk();
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background text-muted-foreground font-mono text-[10px] uppercase tracking-[0.3em]">
        <span>Booting system</span>
        <div className="frame-loader-track" role="status" aria-label="Loading">
          <div className="frame-loader-bar" />
        </div>
      </div>
    );
  }
  if (isError) {
    // A 401/403 means the backend WAS reached — it just rejected the session
    // (expired or, in dev, a stale duplicate Clerk cookie shadowing the fresh
    // one). That is an auth problem, not a connectivity problem, so surface it
    // as "sign in again" rather than the misleading "couldn't reach backend".
    const isAuth = error instanceof ApiError && error.kind === "auth";
    if (isAuth) {
      return (
        <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-background px-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-destructive">
            Session not verified
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            The backend answered, but your sign-in couldn't be confirmed. Sign in
            again to continue.
          </p>
          <button
            type="button"
            onClick={() => {
              void signOut({ redirectUrl: `${basePath}/sign-in` });
            }}
            className="border-y border-foreground/40 px-6 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/90 transition-colors hover:border-foreground/80"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70 transition-colors hover:text-foreground/80 disabled:opacity-50"
          >
            {isFetching ? "Retrying" : "Retry"}
          </button>
        </div>
      );
    }
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-destructive">
          Connection lost
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          The system couldn't reach the backend. It may still be coming online — try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-y border-foreground/40 px-6 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/90 transition-colors hover:border-foreground/80 disabled:opacity-50"
        >
          {isFetching ? "Reconnecting" : "Retry"}
        </button>
      </div>
    );
  }
  if (!data?.fighter) return <OnboardingPage />;
  return <>{children}</>;
}

function Authed({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <Gate>{children}</Gate>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Gate>
          <SplashGate>
            <HomePage />
          </SplashGate>
        </Gate>
      </Show>
      <Show when="signed-out">
        <PublicLandingPage />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const off = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== id) {
        qc.clear();
      }
      prev.current = id;
    });
    return off;
  }, [addListener, qc]);
  return null;
}

function AppRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Sign in to FRAME",
            subtitle: "Welcome back",
          },
        },
        signUp: {
          start: {
            title: "Create your FRAME account",
            subtitle: "Calibration system",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/splash">
              <Authed>
                <SplashPage />
              </Authed>
            </Route>
            <Route path="/" component={HomeRoute} />
            <Route path="/chat">
              <Authed>
                <ChatPage />
              </Authed>
            </Route>
            <Route path="/profile">
              <Authed>
                <ProfilePage />
              </Authed>
            </Route>
            <Route path="/planner">
              <Authed>
                <PlannerPage />
              </Authed>
            </Route>
            <Route path="/analyse">
              <Authed>
                <AnalysePage />
              </Authed>
            </Route>
            <Route path="/competition">
              <Authed>
                <CompetitionPage />
              </Authed>
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
