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
    <nav
      className="flex-none border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]"
      style={{ background: "#000" }}
      aria-label="Primary"
    >
      <div className="grid grid-cols-3 max-w-md mx-auto">
        {TABS.map(({ path, label, Icon }) => {
          const active = location === path || (path === "/chat" && location.startsWith("/chat"));
          return (
            <Link
              key={path}
              href={path}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-3 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:rounded-md ${
                active ? "text-primary" : "text-foreground/45 hover:text-foreground/85"
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
