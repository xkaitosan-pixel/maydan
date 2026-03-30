import { useLocation } from "wouter";
import { getOrCreateUser } from "@/lib/storage";
import { CATEGORIES } from "@/lib/questions";

export default function Stats() {
  const [, navigate] = useLocation();
  const user = getOrCreateUser();
  const stats = user.stats;

  const totalGames = stats.totalGames;
  const winRate = totalGames > 0 ? Math.round((user.wins / Math.max(stats.survivalGames + user.totalChallenges, 1)) * 100) : 0;

  // Find strongest / weakest category
  const catEntries = Object.entries(stats.categoryStats).filter(([, s]) => s.total > 0);
  const catWithPct = catEntries.map(([id, s]) => ({
    id,
    pct: Math.round((s.correct / s.total) * 100),
    correct: s.correct,
    total: s.total,
  })).sort((a, b) => b.pct - a.pct);

  const strongest = catWithPct[0] || null;
  const weakest = catWithPct[catWithPct.length - 1] || null;

  function getCatInfo(id: string) {
    return CATEGORIES.find(c => c.id === id);
  }

  const globalPct = catEntries.reduce((acc, [, s]) => ({ c: acc.c + s.correct, t: acc.t + s.total }), { c: 0, t: 0 });
  const overallPct = globalPct.t > 0 ? Math.round((globalPct.c / globalPct.t) * 100) : 0;

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
        <h1 className="text-lg font-bold">📊 إحصائياتك</h1>
        <span className="mr-auto text-sm text-primary font-bold">{user.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "إجمالي الألعاب", value: totalGames, icon: "🎮", color: "#8b5cf6" },
            { label: "نسبة الإجابات الصحيحة", value: `${overallPct}%`, icon: "🎯", color: "#f59e0b" },
            { label: "أفضل نتيجة بقاء", value: stats.survivalBest, icon: "🏃", color: "#dc2626" },
            { label: "انتصارات التحدي", value: user.wins, icon: "🏆", color: "#16a34a" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-4 fade-in-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{s.icon}</span>
                <span className="text-2xl font-black" style={{ color: s.color }}>{s.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Streak */}
        <div className="bg-orange-500/10 border border-orange-500/25 rounded-2xl p-4 fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🔥</span>
            <p className="font-bold text-orange-400">الستريك اليومي</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-black text-orange-400">{user.streak}</p>
              <p className="text-xs text-muted-foreground">الحالي</p>
            </div>
            <div>
              <p className="text-3xl font-black text-foreground">{user.longestStreak}</p>
              <p className="text-xs text-muted-foreground">الأطول</p>
            </div>
          </div>
          {/* Milestone progress */}
          <div className="mt-3 space-y-2">
            {[{ days: 3, label: "3 أيام 🔥" }, { days: 7, label: "أسبوع ⚡" }, { days: 30, label: "شهر 👑" }].map(m => (
              <div key={m.days}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={user.streak >= m.days ? "text-orange-400 font-bold" : "text-muted-foreground"}>{m.label}</span>
                  <span className="text-muted-foreground">{Math.min(user.streak, m.days)}/{m.days}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-orange-400 transition-all duration-700" style={{ width: `${Math.min(100, (user.streak / m.days) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strongest / Weakest */}
        {(strongest || weakest) && (
          <div className="grid grid-cols-2 gap-3 fade-in-up">
            {strongest && (() => { const cat = getCatInfo(strongest.id); return (
              <div className="bg-card border border-border rounded-2xl p-4" style={{ borderColor: `${cat?.gradientFrom}44` }}>
                <p className="text-xs text-green-400 font-bold mb-2">💪 الأقوى</p>
                <span className="text-3xl">{cat?.icon}</span>
                <p className="text-sm font-bold text-foreground mt-1 leading-tight">{cat?.name}</p>
                <p className="text-2xl font-black mt-2" style={{ color: cat?.gradientFrom }}>{strongest.pct}%</p>
                <p className="text-xs text-muted-foreground">{strongest.correct}/{strongest.total} صحيح</p>
              </div>
            ); })()}
            {weakest && weakest.id !== strongest?.id && (() => { const cat = getCatInfo(weakest.id); return (
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-red-400 font-bold mb-2">📈 يحتاج تطوير</p>
                <span className="text-3xl">{cat?.icon}</span>
                <p className="text-sm font-bold text-foreground mt-1 leading-tight">{cat?.name}</p>
                <p className="text-2xl font-black mt-2 text-red-400">{weakest.pct}%</p>
                <p className="text-xs text-muted-foreground">{weakest.correct}/{weakest.total} صحيح</p>
              </div>
            ); })()}
          </div>
        )}

        {/* Category breakdown */}
        {catWithPct.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 fade-in-up">
            <p className="font-bold mb-4 flex items-center gap-2">
              <span>📈</span> أداؤك في الفئات
            </p>
            <div className="space-y-3">
              {catWithPct.map(({ id, pct, correct, total }) => {
                const cat = getCatInfo(id);
                return (
                  <div key={id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{cat?.icon}</span>
                      <span className="text-sm text-foreground flex-1">{cat?.name}</span>
                      <span className="text-xs text-muted-foreground">{correct}/{total}</span>
                      <span className="text-sm font-bold" style={{ color: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444" }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalGames === 0 && (
          <div className="text-center py-12 fade-in-up">
            <p className="text-5xl mb-4">📊</p>
            <p className="text-muted-foreground">لا توجد إحصائيات بعد</p>
            <p className="text-xs text-muted-foreground mt-1">العب بعض الأدوار لتظهر إحصائياتك!</p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90 transition-opacity"
            >
              ابدأ اللعب
            </button>
          </div>
        )}

        {/* Mode breakdown */}
        {totalGames > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 fade-in-up">
            <p className="font-bold mb-3">🎮 توزيع الألعاب</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">🏃 وضع البقاء</span>
                <span className="font-bold text-red-400">{stats.survivalGames} لعبة</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">⚔️ تحديات ثنائية</span>
                <span className="font-bold text-yellow-400">{user.totalChallenges} تحدي</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">🏆 انتصارات</span>
                <span className="font-bold text-green-400">{user.wins} انتصار</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
