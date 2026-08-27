import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import {
  getCompletedGamesForInstall,
  isInstalledPwa,
  PWA_GAME_COMPLETED_EVENT,
} from "@/lib/pwa";

const DISMISS_KEY = "maydan_install_prompt_dismissed";
const MIN_COMPLETED_GAMES = 2;
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60_000;

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

export default function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalledPwa()) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return;
    if (!isMobile()) return;

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(ios);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const showWhenEligible = () => {
      if (getCompletedGamesForInstall() >= MIN_COMPLETED_GAMES) setVisible(true);
    };
    showWhenEligible();
    window.addEventListener(PWA_GAME_COMPLETED_EVENT, showWhenEligible);

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
      window.removeEventListener(PWA_GAME_COMPLETED_EVENT, showWhenEligible);
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
      setShowIOSHelp(true);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed left-3 right-3 z-[60] mx-auto max-w-md rounded-2xl border border-primary/30 p-4 shadow-xl"
      style={{
        bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))",
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
      <button onClick={dismiss} aria-label="لاحقًا" className="absolute left-2 top-2 p-2 text-white/60">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
          <Download className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">ثبّت ميدان على هاتفك</p>
          <p className="mt-0.5 text-xs text-white/65">العب أسرع — بدون متصفح</p>
        </div>
      </div>
      {showIOSHelp ? (
        <div className="mt-3 rounded-xl bg-white/7 p-3 text-xs leading-6 text-white/80">
          <p className="flex items-center gap-2 font-bold text-white"><Share className="h-4 w-4" /> في Safari اضغط مشاركة</p>
          <p>ثم اختر «إضافة إلى الشاشة الرئيسية» واضغط «إضافة».</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={install} className="rounded-xl bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground">تثبيت</button>
          <button onClick={dismiss} className="rounded-xl bg-white/8 px-3 py-2.5 text-xs font-bold text-white/75">لاحقًا</button>
        </div>
      )}
    </div>
  );
}
