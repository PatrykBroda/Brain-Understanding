import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import OnboardingPage from "@/pages/onboarding";
import { useFighter } from "@/hooks/use-fighter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function Gate() {
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
  return data?.fighter ? <ChatPage /> : <OnboardingPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Gate} />
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
