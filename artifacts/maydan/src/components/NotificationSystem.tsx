import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import {
  collectNotifications,
  markNotifShown,
  onNotifEvent,
  NOTIF_CHECK_EVENT,
  type AppNotif,
} from "@/lib/notifications";

// Don't show notifications during these screens (gameplay / setup)
const SUPPRESS_PREFIXES = [
  "/onboarding",
  "/quiz",
  "/survival",
  "/party",
  "/ranked",
  "/daily", // already on the daily screen
];

export default function NotificationSystem() {
  const { dbUser, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const [queue, setQueue] = useState<AppNotif[]>([]);
  const [current, setCurrent] = useState<AppNotif | null>(null);
  const [exiting, setExiting] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckLocation = useRef<string>("");

  const suppressed = SUPPRESS_PREFIXES.some((p) => location.startsWith(p));

  // Run a notification check
  async function runCheck() {
    if (!dbUser) return;
    const notes = await collectNotifications(dbUser);
    if (notes.length === 0) return;
    setQueue((prev) => {
      const seenIds = new Set(prev.map((n) => n.id));
      const fresh = notes.filter((n) => !seenIds.has(n.id));
      return [...prev, ...fresh];
    });
  }

  // Check on auth ready and when entering the home page
  useEffect(() => {
    if (isLoading || !dbUser) return;
    if (suppressed) return;
    if (location === "/" && lastCheckLocation.current !== "/") {
      lastCheckLocation.current = "/";
      runCheck();
    } else if (location !== "/") {
      lastCheckLocation.current = location;
    }
    // initial check on first auth ready
    if (lastCheckLocation.current === "" && location === "/") {
      lastCheckLocation.current = "/";
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, dbUser?.id, location, suppressed]);

  // Listen for ad-hoc pushes (achievements, manual checks)
  useEffect(() => {
    const offEvent = onNotifEvent((n) => {
      setQueue((prev) =>
        prev.some((x) => x.id === n.id) ? prev : [...prev, n],
      );
    });
    const onCheck = () => runCheck();
    window.addEventListener(NOTIF_CHECK_EVENT, onCheck);
    return () => {
      offEvent();
      window.removeEventListener(NOTIF_CHECK_EVENT, onCheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUser?.id]);

  // Promote next item from queue
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
    setExiting(false);
    markNotifShown(next);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const ms = next.autoDismissMs ?? 5000;
    dismissTimer.current = setTimeout(() => dismiss(), ms);
  }, [current, queue]);

  // Stop showing if suppressed mid-display
  useEffect(() => {
    if (suppressed && current) dismiss(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed]);

  function dismiss(immediate = false) {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (immediate) {
      setCurrent(null);
      setExiting(false);
      return;
    }
    setExiting(true);
    setTimeout(() => {
      setCurrent(null);
      setExiting(false);
    }, 250);
  }

  function handleTap() {
    if (!current) return;
    const route = current.ctaRoute;
    dismiss(true);
    if (route) navigate(route);
  }

  if (suppressed || !current) return null;

  return (
    <>
      <style>{`
        @keyframes mdyNotifSlideIn {
          from { transform: translate(-50%, -120%); opacity: 0; }
          to   { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes mdyNotifSlideOut {
          from { transform: translate(-50%, 0); opacity: 1; }
          to   { transform: translate(-50%, -120%); opacity: 0; }
        }
      `}</style>
      <div
        dir="rtl"
        role="status"
        className="fixed top-4 left-1/2 z-[9999] w-[92%] max-w-md"
        style={{
          transform: "translateX(-50%)",
          animation: exiting
            ? "mdyNotifSlideOut 0.25s ease-in forwards"
            : "mdyNotifSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}
      >
        <div
          onClick={handleTap}
          className="relative cursor-pointer rounded-2xl p-3.5 pr-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
          style={{
            background:
              "linear-gradient(135deg, rgba(217,119,6,0.18) 0%, rgba(124,58,237,0.22) 100%), #11091e",
            border: "1px solid rgba(217,119,6,0.55)",
            boxShadow:
              "0 12px 40px rgba(124,58,237,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(217,119,6,0.45), rgba(124,58,237,0.45))",
              boxShadow: "0 0 18px rgba(217,119,6,0.4)",
            }}
          >
            <span className="text-xl leading-none">{current.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-snug">
              {current.title}
            </p>
            {current.ctaRoute && (
              <p
                className="text-[11px] font-bold mt-0.5"
                style={{ color: "#fbbf24" }}
              >
                اضغط للفتح ←
              </p>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            aria-label="إغلاق"
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 hover:bg-white/10 transition-colors"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
