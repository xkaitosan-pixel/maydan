import { useEffect } from "react";
import { useLocation } from "wouter";
import { Home, Swords, Calendar, Trophy, User } from "lucide-react";

const HIDE_PREFIXES = [
  "/quiz",
  "/survival",
  "/ranked",
  "/party",
  "/daily",
  "/onboarding",
  "/auth",
  "/results",
];

const ITEMS: Array<{ path: string; label: string; Icon: typeof Home }> = [
  { path: "/", label: "الرئيسية", Icon: Home },
  { path: "/create", label: "تحدي", Icon: Swords },
  { path: "/daily", label: "اليوم", Icon: Calendar },
  { path: "/leaderboard", label: "المتصدرون", Icon: Trophy },
  { path: "/profile", label: "ملفي", Icon: User },
];

export default function BottomNav() {
  const [location, navigate] = useLocation();

  const hidden = HIDE_PREFIXES.some(
    (p) => location === p || location.startsWith(p + "/"),
  );

  // Toggle body class so pages get bottom padding when nav is shown
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (hidden) {
      document.body.classList.remove("has-bottom-nav");
    } else {
      document.body.classList.add("has-bottom-nav");
    }
    return () => {
      document.body.classList.remove("has-bottom-nav");
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      dir="rtl"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/40"
      style={{
        background: "rgba(13, 13, 26, 0.95)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <ul className="flex items-stretch justify-around h-14">
        {ITEMS.map(({ path, label, Icon }) => {
          const active =
            path === "/" ? location === "/" : location.startsWith(path);
          return (
            <li key={path} className="flex-1">
              <button
                onClick={() => navigate(path)}
                className="w-full h-full flex flex-col items-center justify-center gap-0.5 transition-colors"
                style={{
                  color: active ? "#f5d98a" : "rgba(255,255,255,0.55)",
                }}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-bold leading-none">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
