import { useEffect, useState } from "react";

const DISMISS_KEY = "maydan_install_prompt_dismissed";
const DELAY_MS = 30_000;

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(
      navigator.userAgent,
    ) || window.matchMedia("(max-width: 768px)").matches
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as any).standalone === true
  );
}

export default function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!isMobile()) return;

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(ios);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const t = setTimeout(() => setVisible(true), DELAY_MS);

    const onInstalled = () => {
      setVisible(false);
      try {
        localStorage.setItem(DISMISS_KEY, "installed");
      } catch {}
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }

  async function install() {
    if (bip) {
      try {
        await bip.prompt();
        const { outcome } = await bip.userChoice;
        if (outcome === "accepted") {
          setVisible(false);
        } else {
          dismiss();
        }
      } catch {
        dismiss();
      }
      setBip(null);
    } else if (isIOS) {
      // iOS doesn't support beforeinstallprompt — show instructions instead
      alert(
        'لإضافة ميدان لشاشتك الرئيسية:\n١. اضغط زر المشاركة في Safari\n٢. اختر "إضافة إلى الشاشة الرئيسية"',
      );
      dismiss();
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-3 left-3 right-3 z-[60] mx-auto max-w-md rounded-2xl border border-primary/30 p-3 flex items-center gap-3 shadow-xl"
      style={{
        background: "linear-gradient(135deg, rgba(13,13,26,0.96), rgba(26,13,46,0.96))",
        backdropFilter: "blur(12px)",
        animation: "mdyInstallSlide 0.35s ease-out",
      }}
    >
      <style>{`
        @keyframes mdyInstallSlide {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(217,119,6,0.45), rgba(124,58,237,0.45))",
        }}
      >
        📱
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-snug">
          أضف ميدان لشاشتك الرئيسية
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          العب بسهولة من شاشة هاتفك مباشرة
        </p>
      </div>
      <button
        onClick={install}
        className="px-3 py-2 rounded-xl text-xs font-bold text-background shrink-0"
        style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
      >
        تثبيت
      </button>
      <button
        onClick={dismiss}
        aria-label="إغلاق"
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 hover:bg-white/10 text-white/70"
      >
        ✕
      </button>
    </div>
  );
}
