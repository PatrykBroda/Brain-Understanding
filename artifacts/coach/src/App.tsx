import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import OnboardingPage from "@/pages/onboarding";
import StatePage from "@/pages/state";
import DashboardPage from "@/pages/dashboard";
import ProfilePage from "@/pages/profile";
import HistoryPage from "@/pages/history";
import CampPage from "@/pages/planner";
import AnalysePage from "@/pages/analyse";
import SplashPage from "@/pages/splash";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import { useFighter } from "@/hooks/use-fighter";
import { ApiError } from "@/lib/api";
import { setApiTokenGetter } from "@/lib/api";
import { FramePlusProvider } from "@/components/frame-plus-modal";
import { AuthProvider, useAuth } from "@/context/auth-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
    // (expired or, in dev, a stale duplicate cookie shadowing the fresh one).
    // That is an auth problem, not a connectivity problem.
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
              signOut();
              setLocation(`${basePath}/sign-in`);
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
  return <Gate>{children}</Gate>;
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
  "/chat": "Chat · FRAME",
  "/analyse": "Analyse · FRAME",
  "/camp": "Camp · FRAME",
  "/profile": "Profile · FRAME",
  "/history": "History · FRAME",
  "/splash": "FRAME",
  "/sign-in": "Sign in · FRAME",
  "/sign-up": "Create account · FRAME",
};

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
      <TooltipProvider>
        <FramePlusProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
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
