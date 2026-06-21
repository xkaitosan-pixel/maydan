import { useState } from "react";
import { LOGIN_REWARDS, claimLoginReward, type LoginInfo } from "@/lib/engagement";
import { playSound } from "@/lib/sound";

interface LoginStreakPopupProps {
  userId: string;
  info: LoginInfo;
  onClose: () => void;
  onClaimed?: (coins: number) => void;
}

export default function LoginStreakPopup({ userId, info, onClose, onClaimed }: LoginStreakPopupProps) {
  const [claimed, setClaimed] = useState(!info.canClaim);
  const [busy, setBusy] = useState(false);
  const [gained, setGained] = useState(0);

  async function handleClaim() {
    if (busy || claimed) return;
    setBusy(true);
    const res = await claimLoginReward(userId);
    if (res.ok) {
      setClaimed(true);
      setGained(res.coins);
      try { playSound("coin"); } catch { /* noop */ }
      onClaimed?.(res.coins);
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[380] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-1 text-4xl">🔥</div>
        <h3 className="text-xl font-black text-foreground">سلسلة الدخول اليومي</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          {info.streak} {info.streak === 1 ? "يوم" : "أيام"} متتالية — استمر!
        </p>

        <div className="mb-5 grid grid-cols-7 gap-1.5">
          {LOGIN_REWARDS.map((reward, i) => {
            const day = i + 1;
            const isToday = day === info.dayInCycle;
            const isPast = day < info.dayInCycle;
            const isClaimedToday = isToday && claimed;
            return (
              <div
                key={day}
                className="flex flex-col items-center rounded-xl border py-2 px-0.5"
                style={{
                  background: isToday
                    ? "linear-gradient(160deg,#d97706,#92400e)"
                    : isPast
                      ? "rgba(34,197,94,0.12)"
                      : "rgba(255,255,255,0.04)",
                  borderColor: isToday ? "#f59e0b" : isPast ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)",
                }}
              >
                <span className="text-[9px] font-bold text-white/70">يوم {day}</span>
                <span className="text-sm leading-tight">{isPast || isClaimedToday ? "✅" : "🪙"}</span>
                <span className={`text-[10px] font-black ${isToday ? "text-white" : "text-muted-foreground"}`}>{reward}</span>
              </div>
            );
          })}
        </div>

        {claimed ? (
          <div className="rounded-2xl border border-green-500/40 bg-green-500/10 py-3 text-sm font-black text-green-400">
            {gained > 0 ? `🎉 حصلت على ${gained} قرش!` : "✅ استلمت مكافأة اليوم"}
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={busy}
            className="w-full rounded-2xl py-3.5 font-black text-background disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            {busy ? "..." : `استلم مكافأتك (${info.reward} قرش)`}
          </button>
        )}

        <button onClick={onClose} className="mt-3 text-xs text-muted-foreground hover:text-foreground">
          إغلاق
        </button>
      </div>
    </div>
  );
}
