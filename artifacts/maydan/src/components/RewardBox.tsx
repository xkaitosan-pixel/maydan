import { useState, useEffect } from "react";
import { isRewardBoxReady, getRewardBoxCountdown, openRewardBox, RewardType } from "@/lib/storage";

const REWARD_META: Record<RewardType, { icon: string; title: string; desc: string; color: string }> = {
  power_cards:  { icon: "🃏", title: "+2 بطاقة قوة!", desc: "استرددت بطاقتي تخطي ووقت إضافي", color: "#8b5cf6" },
  challenges:   { icon: "⚔️", title: "+5 تحديات!", desc: "رصيدك اليومي تجدّد بـ 5 تحديات إضافية", color: "#d97706" },
  temp_premium: { icon: "⭐", title: "بريميوم مؤقت!", desc: "تمتع بمميزات بريميوم كاملة لمدة 24 ساعة", color: "#eab308" },
  temp_legends: { icon: "🏆", title: "تحدي الأساطير مفتوح!", desc: "فئة الأساطير متاحة لك اليوم مجاناً", color: "#f59e0b" },
};

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RewardBox() {
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [opening, setOpening] = useState(false);
  const [reward, setReward] = useState<RewardType | null>(null);
  const [showReward, setShowReward] = useState(false);

  useEffect(() => {
    function tick() {
      setReady(isRewardBoxReady());
      setCountdown(getRewardBoxCountdown());
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  function handleOpen() {
    if (!ready || opening) return;
    setOpening(true);
    setTimeout(() => {
      const r = openRewardBox();
      setReward(r);
      setOpening(false);
      setShowReward(true);
      setReady(false);
      setCountdown(getRewardBoxCountdown());
    }, 1200);
  }

  function closeReward() {
    setShowReward(false);
    setReward(null);
  }

  if (showReward && reward) {
    const meta = REWARD_META[reward];
    return (
      <div className="rounded-2xl p-4 border fade-in-up text-center relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${meta.color}15, ${meta.color}25)`, borderColor: `${meta.color}50` }}>
        <button onClick={closeReward} className="absolute top-2 left-2 text-muted-foreground text-sm hover:text-foreground">✕</button>
        <div className="text-4xl mb-2 animate-bounce">{meta.icon}</div>
        <p className="font-black text-lg" style={{ color: meta.color }}>{meta.title}</p>
        <p className="text-xs text-muted-foreground mt-1">{meta.desc}</p>
        <p className="text-xs text-muted-foreground mt-2 opacity-60">الصندوق التالي: غداً 🎁</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border overflow-hidden relative transition-all ${ready ? "cursor-pointer hover:scale-[1.02]" : "opacity-80"}`}
      style={{ background: ready ? "linear-gradient(135deg,#d9770620,#f59e0b20)" : "hsl(var(--card))", borderColor: ready ? "#d9770640" : "hsl(var(--border))" }}
      onClick={ready ? handleOpen : undefined}
    >
      <div className="p-4 flex items-center gap-4">
        {/* Box graphic */}
        <div className={`relative flex-shrink-0 ${opening ? "animate-bounce" : ready ? "animate-pulse" : ""}`}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: ready ? "linear-gradient(135deg,#d97706,#f59e0b)" : "hsl(var(--muted))" }}>
            {opening ? "✨" : "🎁"}
          </div>
          {ready && !opening && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-background animate-ping" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{ready ? "المكافأة اليومية جاهزة!" : "صندوق المكافآت"}</p>
          {ready ? (
            <p className="text-xs text-muted-foreground mt-0.5">انقر لفتح مكافأتك اليومية 🎉</p>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mt-0.5">يفتح في</p>
              <p className="text-base font-black text-primary tabular-nums" dir="ltr">{formatCountdown(countdown)}</p>
            </div>
          )}
        </div>

        {ready && (
          <div className="shrink-0">
            <div className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
              {opening ? "⏳" : "افتح"}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar (time elapsed) */}
      {!ready && (
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-none" style={{ width: `${100 - (countdown / (24 * 3600000)) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
