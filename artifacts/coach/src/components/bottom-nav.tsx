import { Link, useLocation } from "wouter";
import { Home, MessageSquare, User } from "lucide-react";

const TABS = [
  { path: "/", label: "Home", Icon: Home },
  { path: "/chat", label: "Chat", Icon: MessageSquare },
  { path: "/profile", label: "Profile", Icon: User },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="flex-none border-t border-border/60 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3 max-w-md mx-auto">
        {TABS.map(({ path, label, Icon }) => {
          const active = location === path || (path === "/chat" && location.startsWith("/chat"));
          return (
            <Link
              key={path}
              href={path}
              className={`flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="font-mono text-[9px] uppercase tracking-widest">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
