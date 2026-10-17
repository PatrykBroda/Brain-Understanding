import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import OnboardingPage from "@/pages/onboarding";
import StatePage from "@/pages/state";
import OrbPage from "@/pages/orb";
import DashboardPage from "@/pages/dashboard";
import ProfilePage from "@/pages/profile";
import HistoryPage from "@/pages/history";
import CampPage from "@/pages/planner";
import AnalysePage from "@/pages/analyse";
import SplashPage from "@/pages/splash";
import { AppBackdrop, MEDIA } from "@/components/media-backdrop";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import { useFighter } from "@/hooks/use-fighter";
import { ApiError, api } from "@/lib/api";
import { setApiTokenGetter } from "@/lib/api";
import { FramePlusProvider } from "@/components/frame-plus-modal";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { useAiConsent, useSetAiConsent } from "@/hooks/use-ai-consent";
import { AiConsentModal } from "@/components/ai-consent-modal";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const GATE_BTN = "btn-glass w-full max-w-[16rem] disabled:opacity-50";

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="frame-ambient relative flex h-[100dvh] flex-col items-center justify-center gap-5 overflow-hidden px-6 text-center">
      {children}
    </div>
  );
}

function BootScreen({ label }: { label: string }) {
  return (
    <GateShell>
      <div aria-hidden className="glow-orb h-64 w-64 opacity-60" />
      <span className="eyebrow eyebrow-gold relative">{label}</span>
      <div className="frame-loader-track relative" role="status" aria-label="Loading">
        <div className="frame-loader-bar" />
      </div>
    </GateShell>
  );
}

function GateError({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GateShell>
      <div className="glass glass-red frame-rise flex w-full max-w-sm flex-col items-center gap-4 p-8">
        <div className="eyebrow !text-[#E0564E]">{title}</div>
        {children}
      </div>
    </GateShell>
  );
}

function ConsentGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useAiConsent();
  const setConsent = useSetAiConsent();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();

  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <BootScreen label="Checking permissions" />
    );
  }

  if (isError) {
    const isAuth = error instanceof ApiError && error.kind === "auth";
    if (isAuth) {
      return (
        <GateError title="Session not verified">
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            The backend answered, but your sign-in couldn't be confirmed. Sign in
            again to continue.
          </p>
          <button
            type="button"
            onClick={() => {
              signOut();
              setLocation(`${basePath}/sign-in`);
            }}
            className={GATE_BTN}
          >
            Sign in
          </button>
        </GateError>
      );
    }
    return (
      <GateError title="Connection lost">
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          The system couldn't reach the backend to check permissions.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className={GATE_BTN}
        >
          {isFetching ? "Reconnecting" : "Retry"}
        </button>
      </GateError>
    );
  }

  // If consent is not accepted, show the mandatory gate
  if (data && !data.accepted) {
    return (
      <>
        <AiConsentModal
          status={data}
          mandatory={true}
          busy={isAccepting || isDeleting}
          onAccept={async () => {
            if (isAccepting || isDeleting) return;
            setIsAccepting(true);
            setAcceptError(null);
            try {
              await setConsent.mutateAsync();
            } catch (err) {
              setAcceptError(err instanceof Error ? err.message : "Failed to save permission.");
            } finally {
              setIsAccepting(false);
            }
          }}
          onSignOut={async () => {
            if (isAccepting || isDeleting) return;
            await signOut();
            setLocation(`${basePath}/sign-in`);
          }}
          onDeleteAccount={async () => {
            if (isAccepting || isDeleting) return;
            setIsDeleting(true);
            setDeleteError(null);
            try {
              await api.deleteAccount();
              await signOut();
              setLocation(`${basePath}/sign-in`);
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
              setIsDeleting(false);
            }
          }}
        />
        {(deleteError || acceptError) && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-destructive/90 text-destructive-foreground px-5 py-3 text-xs tracking-wide rounded-full shadow-lg">
            {deleteError || acceptError}
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}

function SplashGate({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    try {
      const introSeen = localStorage.getItem("frame:intro-seen");
      if (!introSeen) {
        // First ever launch — show cinematic intro (splash sets intro-seen on exit)
        setLocation("/splash", { replace: true });
      }
      // Returning athletes go straight to the hub — no interstitial briefing.
    } catch {
      // storage blocked — skip the intro
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useFighter();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();
  if (isLoading) {
    return (
      <BootScreen label="Booting system" />
    );
  }
  if (isError) {
    // A 401/403 means the backend WAS reached — it just rejected the session
    // (expired or, in dev, a stale duplicate cookie shadowing the fresh one).
    // That is an auth problem, not a connectivity problem.
    const isAuth = error instanceof ApiError && error.kind === "auth";
    if (isAuth) {
      return (
        <GateError title="Session not verified">
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            The backend answered, but your sign-in couldn't be confirmed. Sign in
            again to continue.
          </p>
          <button
            type="button"
            onClick={() => {
              signOut();
              setLocation(`${basePath}/sign-in`);
            }}
            className={GATE_BTN}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="min-h-[44px] text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {isFetching ? "Retrying" : "Retry"}
          </button>
        </GateError>
      );
    }
    return (
      <GateError title="Connection lost">
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          The system couldn't reach the backend. It may still be coming online — try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className={GATE_BTN}
        >
          {isFetching ? "Reconnecting" : "Retry"}
        </button>
      </GateError>
    );
  }
  if (!data?.fighter) return <OnboardingPage />;
  return <>{children}</>;
}

/** Wire the token getter once; updates whenever token changes. */
function ApiSetup() {
  const { token } = useAuth();
  useEffect(() => {
    setApiTokenGetter(() => token);
  }, [token]);
  return null;
}

/**
 * Clears the React Query cache whenever the signed-in identity changes —
 * including sign-out (userId: string → null) and sign-in as a different user.
 * Without this, a second athlete briefly sees the prior user's cached fighter,
 * analyses, conversations, and other account data until refetch completes.
 *
 * Must be inside both AuthProvider (for useAuth) and QueryClientProvider (for
 * useQueryClient).
 */
function UserScopedQueryReset() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== userId) {
      qc.clear();
    }
    prevRef.current = userId;
  }, [userId, qc]);
  return null;
}

function Authed({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return (
    <ConsentGate>
      <Gate>{children}</Gate>
    </ConsentGate>
  );
}

function HomeRoute() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/home" />;
  return <Redirect to="/sign-in" />;
}

// Runtime titles per route
const DEFAULT_TITLE = "FRAME — AI Combat Sports Coach";
const PAGE_TITLES: Record<string, string> = {
  "/": DEFAULT_TITLE,
  "/home": "Home · FRAME",
  "/state": "State · FRAME",
  "/orb": "FRAME",
  "/chat": "Chat · FRAME",
  "/analyse": "Analyse · FRAME",
  "/camp": "Camp · FRAME",
  "/profile": "Profile · FRAME",
  "/history": "History · FRAME",
  "/splash": "FRAME",
  "/sign-in": "Sign in · FRAME",
  "/sign-up": "Create account · FRAME",
};

const BACKDROPS: Record<string, { src: string; position?: string }> = {
  "/home": { src: MEDIA.stillB, position: "60% 40%" },
  "/chat": { src: MEDIA.gym, position: "50% 30%" },
  "/analyse": { src: MEDIA.stillA, position: "50% 40%" },
  "/camp": { src: MEDIA.stillB, position: "30% 40%" },
  "/profile": { src: MEDIA.gym, position: "40% 25%" },
  "/history": { src: MEDIA.stillA, position: "70% 40%" },
};

function RouteBackdrop() {
  const [location] = useLocation();
  const b = BACKDROPS["/" + (location.split("/")[1] ?? "")];
  return b ? <AppBackdrop src={b.src} position={b.position} /> : null;
}

function PageTitle() {
  const [location] = useLocation();
  useEffect(() => {
    const top = "/" + (location.split("/")[1] ?? "");
    document.title = PAGE_TITLES[top === "/" ? "/" : top] ?? DEFAULT_TITLE;
  }, [location]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiSetup />
      <UserScopedQueryReset />
      <PageTitle />
      <RouteBackdrop />
      <TooltipProvider>
        <FramePlusProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            {/* Chrome-less orb surface embedded by the mobile app via WebView.
                Public (no Authed gate) so the native shell can render the exact
                same WebGL orb the web hub uses. See frame-mobile OrbWebView. */}
            <Route path="/orb" component={OrbPage} />
            <Route path="/splash">
              <Authed>
                <SplashPage />
              </Authed>
            </Route>
            {/* Retired interstitial — send old bookmarks/history entries home */}
            <Route path="/daily-briefing">
              <Redirect to="/" />
            </Route>
            <Route path="/" component={HomeRoute} />
            <Route path="/home">
              <Authed>
                <SplashGate>
                  <DashboardPage />
                </SplashGate>
              </Authed>
            </Route>
            <Route path="/state">
              <Authed>
                <StatePage />
              </Authed>
            </Route>
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
            <Route path="/history">
              <Authed>
                <HistoryPage />
              </Authed>
            </Route>
            <Route path="/camp">
              <Authed>
                <CampPage />
              </Authed>
            </Route>
            <Route path="/planner">
              <Redirect to="/camp" />
            </Route>
            <Route path="/competition">
              <Redirect to="/camp" />
            </Route>
            <Route path="/analyse">
              <Authed>
                <AnalysePage />
              </Authed>
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </FramePlusProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </WouterRouter>
  );
}

export default App;
