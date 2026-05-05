import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS } from "@/lib/gamification";
import { pushAchievement } from "@/lib/notifications";
import { hapticAchievement } from "@/lib/haptics";

interface AchievementPopupProps {
  unlockedIds: string[];
  onDone: () => void;
}

export default function AchievementPopup({ unlockedIds, onDone }: AchievementPopupProps) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const achievements = unlockedIds
    .map(id => ACHIEVEMENTS.find(a => a.id === id))
    .filter(Boolean) as typeof ACHIEVEMENTS;

  // Fire toast notifications once per unlock batch
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || achievements.length === 0) return;
    notifiedRef.current = true;
    hapticAchievement();
    achievements.forEach(a => pushAchievement(a.title));
  }, [achievements]);

  useEffect(() => {
    if (achievements.length === 0) { onDone(); return; }
    const timer = setTimeout(() => {
      if (idx < achievements.length - 1) {
        setVisible(false);
        setTimeout(() => { setIdx(i => i + 1); setVisible(true); }, 300);
      } else {
        setVisible(false);
        setTimeout(onDone, 400);
      }
    }, 3200);
    return () => clearTimeout(timer);
  }, [idx]);

  if (achievements.length === 0) return null;
  const ach = achievements[idx];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.7)" }}>
      {/* Confetti-style background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-sm animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top:  `${Math.random() * 100}%`,
              background: ["#f59e0b","#8b5cf6","#06b6d4","#10b981","#ef4444"][i % 5],
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1 + Math.random()}s`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>

      <div
        className={`relative z-10 rounded-3xl p-6 text-center max-w-xs w-full border border-yellow-500/30 transition-all duration-300 ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        style={{ background: "hsl(220 20% 10%)", boxShadow: "0 0 60px rgba(245,158,11,0.3)" }}
      >
        {/* Badge */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 border-2 border-yellow-500"
          style={{ background: "linear-gradient(135deg,#d97706,#92400e)", boxShadow: "0 0 30px rgba(245,158,11,0.5)" }}
        >
          {ach.icon}
        </div>

        <div className="text-yellow-400 text-xs font-bold tracking-widest mb-1 uppercase">إنجاز جديد! 🎉</div>
        <h2 className="text-2xl font-black text-white mb-1">{ach.title}</h2>
        <p className="text-muted-foreground text-sm mb-4">{ach.desc}</p>

        {/* Rewards */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1.5">
            <span className="text-base">⭐</span>
            <span className="text-sm font-black text-purple-300">+{ach.xp} XP</span>
          </div>
          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1.5">
            <span className="text-base">🪙</span>
            <span className="text-sm font-black text-yellow-400">+{ach.coins}</span>
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={() => {
            const text = `🏆 حققت إنجاز "${ach.title}" في ميدان!\n${ach.desc}\nانضم للتحدي: ${window.location.origin}`;
            if (navigator.share) {
              navigator.share({ text }).catch(() => {});
            } else {
              navigator.clipboard?.writeText(text);
            }
          }}
          className="text-xs text-secondary hover:text-secondary/80 transition-colors"
        >
          📤 مشاركة الإنجاز
        </button>

        {achievements.length > 1 && (
          <p className="text-[10px] text-muted-foreground mt-3">
            {idx + 1} / {achievements.length}
          </p>
        )}
      </div>
    </div>
  );
}
