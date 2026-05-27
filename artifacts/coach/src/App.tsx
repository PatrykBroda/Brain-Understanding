import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import OnboardingPage from "@/pages/onboarding";
import HomePage from "@/pages/home";
import ProfilePage from "@/pages/profile";
import SplashPage from "@/pages/splash";
import { useFighter } from "@/hooks/use-fighter";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function Gate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useFighter();
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-muted-foreground font-mono text-[10px] uppercase tracking-[0.3em]">
        Booting system
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-destructive font-mono text-xs">
        Backend unreachable
      </div>
    );
  }
  if (!data?.fighter) return <OnboardingPage />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/splash">
        <Gate>
          <SplashPage />
        </Gate>
      </Route>
      <Route path="/">
        <Gate>
          <SplashGate>
            <HomePage />
          </SplashGate>
        </Gate>
      </Route>
      <Route path="/chat">
        <Gate>
          <ChatPage />
        </Gate>
      </Route>
      <Route path="/profile">
        <Gate>
          <ProfilePage />
        </Gate>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
