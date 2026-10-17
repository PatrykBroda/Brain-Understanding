import { Link, useLocation } from "wouter";
import { Home, MessageSquare, User, Calendar, Film, CircleDot } from "lucide-react";

// One icon family (lucide) at one stroke weight. Labels are sentence case, 12px+.
const ICON_STROKE = 1.75;
const TABS = [
  { path: "/home", label: "Home", Icon: Home },
  { path: "/state", label: "State", Icon: CircleDot },
  { path: "/chat", label: "Chat", Icon: MessageSquare },
  { path: "/analyse", label: "Analyse", Icon: Film },
  { path: "/profile", label: "Profile", Icon: User },
  { path: "/camp", label: "Camp", Icon: Calendar },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    // Navigation is one of the few surfaces allowed translucency + blur.
    <nav
      className="flex-none border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      style={{ background: "rgba(8,9,11,0.88)" }}
      aria-label="Primary"
    >
      <div className="mx-auto grid max-w-md grid-cols-6 px-1">
        {TABS.map(({ path, label, Icon }) => {
          const active =
            location === path ||
            (path === "/chat" && location.startsWith("/chat")) ||
            (path === "/analyse" && location.startsWith("/analyse")) ||
            (path === "/camp" && location.startsWith("/camp"));
          return (
            <Link
              key={path}
              href={path}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[12px] py-2 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/70 motion-reduce:transition-none ${
                active ? "text-[#F4F4F1]" : "text-[#A4A8AE] hover:text-[#F4F4F1]"
              }`}
            >
              {active && (
                <span aria-hidden className="absolute left-1/2 top-0 h-[2px] w-5 -translate-x-1/2 rounded-full bg-[#B9A477]" />
              )}
              <Icon className="h-[22px] w-[22px]" strokeWidth={ICON_STROKE} aria-hidden />
              <span className={`text-xs leading-none ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
