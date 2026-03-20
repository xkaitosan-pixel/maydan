import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  getOrCreateUser, updateDisplayName, canCreateChallenge,
  getRemainingChallenges, updateStreak
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StreakMilestone from "@/components/StreakMilestone";

export default function Home() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [milestone, setMilestone] = useState<number | null>(null);

  useEffect(() => {
    const user = getOrCreateUser();
    if (user.displayName) {
      setName(user.displayName);
      setHasName(true);
    }
    setRemaining(getRemainingChallenges());
    const hit = updateStreak();
    if (hit) setMilestone(hit);
  }, []);

  function handleSaveName() {
    if (!name.trim()) return;
    updateDisplayName(name.trim());
    setHasName(true);
    setRemaining(getRemainingChallenges());
    const hit = updateStreak();
    if (hit) setMilestone(hit);
  }

  const user = getOrCreateUser();
  const canCreate = canCreateChallenge();
  const streak = user.streak;

  const modes = [
    {
      id: "survival",
      icon: "🏃",
      label: "وضع البقاء",
      sub: "كم تصمد؟",
      gradient: "linear-gradient(135deg, #dc2626, #ef4444)",
      border: "#dc262644",
      onClick: () => navigate("/survival"),
    },
    {
      id: "challenge",
      icon: "⚔️",
      label: "تحدي ثنائي",
      sub: "١ ضد ١",
      gradient: "linear-gradient(135deg, #d97706, #f59e0b)",
      border: "#d9770644",
      onClick: () => canCreate ? navigate("/create") : null,
      disabled: !canCreate,
    },
    {
      id: "room",
      icon: "👥",
      label: "غرفة أصدقاء",
      sub: "قريباً",
      gradient: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
      border: "#7c3aed44",
      onClick: () => {},
      disabled: true,
      soon: true,
    },
  ];

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col">
      {/* Milestone popup */}
      {milestone && <StreakMilestone days={milestone} onClose={() => setMilestone(null)} />}

      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex justify-between items-center border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center text-background font-bold text-base">
            م
          </div>
          <span className="text-xl font-black text-primary">ميدان</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Streak badge */}
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 rounded-full px-2.5 py-1">
              <span className="text-sm">🔥</span>
              <span className="text-xs font-bold text-orange-400">{streak}</span>
            </div>
          )}
          {/* Stats button */}
          {hasName && (
            <button
              onClick={() => navigate("/stats")}
              className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="إحصائياتك"
            >
              📊
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Hero section */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center gold-glow mb-3 mx-auto">
            <span className="text-4xl">⚔️</span>
          </div>
          <h1 className="text-4xl font-black text-primary">ميدان</h1>
          <p className="text-secondary text-sm font-semibold mt-1">تحدي المعرفة العربي</p>
        </div>

        {/* Streak strip */}
        {hasName && streak > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/25 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-3xl">🔥</span>
            <div>
              <p className="font-bold text-orange-400 text-sm">{streak} يوم متتالي!</p>
              <p className="text-xs text-muted-foreground">
                {streak >= 30 ? "أسطوري 👑" : streak >= 7 ? "رائع! استمر ⚡" : "استمر تكسب شارات 🎯"}
              </p>
            </div>
            <div className="mr-auto text-xs text-muted-foreground">
              أفضل: {user.longestStreak} 🏆
            </div>
          </div>
        )}

        {/* Name input */}
        {!hasName ? (
          <div className="space-y-3 fade-in-up">
            <p className="text-sm text-muted-foreground text-center">أدخل اسمك للبدء:</p>
            <div className="flex gap-2">
              <Input
                className="text-right bg-card border-border"
                placeholder="اسمك هنا..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                maxLength={20}
              />
              <Button onClick={handleSaveName} disabled={!name.trim()} className="gradient-gold text-background font-bold hover:opacity-90 shrink-0">
                ابدأ
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Welcome */}
            <div className="text-center">
              <p className="text-muted-foreground text-sm">مرحباً، <span className="text-foreground font-bold">{user.displayName}</span></p>
              {!canCreate && (
                <p className="text-xs text-destructive mt-1">وصلت للحد اليومي المجاني ⛔</p>
              )}
            </div>

            {/* MODE SELECTOR */}
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-3 text-center tracking-wider uppercase">اختر وضع اللعب</p>
              <div className="grid grid-cols-3 gap-3">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={mode.onClick}
                    disabled={mode.disabled}
                    className={`relative rounded-2xl p-3 text-center transition-all ${mode.disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.03] active:scale-[0.97]"}`}
                    style={{ background: mode.gradient, border: `1px solid ${mode.border}` }}
                  >
                    {mode.soon && (
                      <span className="absolute top-1.5 left-1.5 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full font-bold">
                        قريباً
                      </span>
                    )}
                    <span className="block text-2xl mb-1">{mode.icon}</span>
                    <p className="text-white font-black text-xs leading-tight">{mode.label}</p>
                    <p className="text-white/70 text-[10px] mt-0.5">{mode.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "الألعاب", value: user.stats.totalGames },
                { label: "انتصارات", value: user.wins },
                { label: "بقاء أفضل", value: user.stats.survivalBest },
                { label: "تحديات", value: user.totalChallenges },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-2 text-center card-hover">
                  <p className="text-lg font-black text-primary">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Stats + change name row */}
            <div className="flex justify-center gap-4">
              <button onClick={() => navigate("/stats")} className="text-xs text-secondary hover:text-secondary/80 transition-colors flex items-center gap-1">
                📊 إحصائياتي الكاملة
              </button>
              <span className="text-border">|</span>
              <button onClick={() => setHasName(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                تغيير الاسم ✏️
              </button>
            </div>
          </>
        )}

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {["⏱️ 30 ثانية", "🃏 بطاقات القوة", "📲 واتساب", "🔥 ستريك يومي"].map((f) => (
            <span key={f} className="bg-card border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">{f}</span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-3 text-center text-xs text-muted-foreground border-t border-border/30">
        <span className="text-primary">ميدان</span> — النسخة المجانية: 5 تحديات يومياً
      </footer>
    </div>
  );
}
