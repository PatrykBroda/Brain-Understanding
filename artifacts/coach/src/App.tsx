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
import SplashPage from "@/pages/splash";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import PublicLandingPage from "@/pages/landing";
import { useFighter } from "@/hooks/use-fighter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

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
    colorBackground: "hsl(0, 0%, 6%)",
    colorInput: "hsl(0, 0%, 9%)",
    colorInputForeground: "hsl(0, 0%, 95%)",
    colorNeutral: "hsl(0, 0%, 18%)",
    fontFamily: "'Outfit', system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[hsl(0,0%,6%)] border border-white/[0.06] rounded-2xl w-[420px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:
      "text-foreground/95 font-light tracking-[0.18em] uppercase text-[15px]",
    headerSubtitle: "text-foreground/55 font-mono text-[11px] tracking-[0.18em] uppercase",
    socialButtonsBlockButton:
      "bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.05] text-foreground/90",
    socialButtonsBlockButtonText: "text-foreground/90 font-sans",
    formFieldLabel:
      "text-foreground/70 font-mono text-[10px] uppercase tracking-[0.25em]",
    formFieldInput:
      "bg-[hsl(0,0%,9%)] border border-white/[0.08] text-foreground placeholder:text-foreground/30",
    formButtonPrimary:
      "bg-primary text-black hover:bg-primary/90 font-mono uppercase tracking-[0.25em] text-[11px]",
    footerActionLink: "text-primary hover:text-primary/80",
    footerActionText: "text-foreground/55",
    footerAction: "bg-transparent",
    dividerLine: "bg-white/[0.08]",
    dividerText: "text-foreground/45 font-mono text-[10px] uppercase tracking-[0.3em]",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-foreground/90",
    alert:
      "bg-white/[0.03] border border-white/[0.08] text-foreground/90",
    otpCodeFieldInput:
      "bg-[hsl(0,0%,9%)] border border-white/[0.08] text-foreground",
    logoBox: "flex justify-center pt-2 pb-1",
    logoImage: "h-10 w-auto",
    main: "gap-4",
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
