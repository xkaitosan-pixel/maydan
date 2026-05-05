import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { ACHIEVEMENTS, parseAchievementsData } from "@/lib/gamification";

export default function Achievements() {
  const [, navigate] = useLocation();
  const { dbUser } = useAuth();

  const aData = parseAchievementsData(dbUser?.achievements);
  const progress = aData.progress;
  const unlocked = aData.unlocked;

  const totalXP = ACHIEVEMENTS.filter(a => unlocked.includes(a.id)).reduce((sum, a) => sum + a.xp, 0);
  const totalCoins = ACHIEVEMENTS.filter(a => unlocked.includes(a.id)).reduce((sum, a) => sum + a.coins, 0);

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col">
      <header className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground text-xl hover:text-foreground transition-colors">←</button>
        <h1 className="text-lg font-black text-foreground flex-1">🏅 الإنجازات</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1">
            <span className="text-sm">⭐</span>
            <span className="text-xs font-bold text-purple-300">+{totalXP} XP</span>
          </div>
          <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1">
            <span className="text-sm">🪙</span>
            <span className="text-xs font-bold text-yellow-400">{totalCoins}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary */}
        <div
          className="rounded-2xl p-4 border border-white/10 flex items-center justify-between"
          style={{ background: "hsl(220 20% 12%)" }}
        >
          <div>
            <p className="text-2xl font-black text-primary">{unlocked.length} / {ACHIEVEMENTS.length}</p>
            <p className="text-sm text-muted-foreground">إنجاز مكتمل</p>
          </div>
          <div className="w-24 h-24 relative">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke="url(#achieveGrad)" strokeWidth="3"
                strokeDasharray={`${(unlocked.length / ACHIEVEMENTS.length) * 94} 94`}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="achieveGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-black text-primary">
                {Math.round((unlocked.length / ACHIEVEMENTS.length) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Empty state when nothing unlocked yet */}
        {unlocked.length === 0 && (
          <div className="text-center py-6 rounded-2xl border border-border/40 bg-card">
            <p className="text-5xl mb-3">🏅</p>
            <p className="text-foreground font-bold">لا إنجازات بعد! العب لتفتحها 🏅</p>
            <p className="text-xs text-muted-foreground mt-1 px-6">
              كل إنجاز يفتح يمنحك XP وعملات إضافية
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90"
            >
              ابدأ اللعب الآن
            </button>
          </div>
        )}

        {/* Achievement cards */}
        <div className="grid grid-cols-1 gap-3">
          {ACHIEVEMENTS.map((ach) => {
            const isUnlocked = unlocked.includes(ach.id);
            const raw = progress[ach.progressKey];
            const currentVal = Array.isArray(raw)
              ? (raw as string[]).length
              : ((raw as number) ?? 0);
            const pct = Math.min(currentVal / ach.totalNeeded, 1);

            return (
              <div
                key={ach.id}
                className={`rounded-2xl p-4 border transition-all ${
                  isUnlocked
                    ? "border-yellow-500/30"
                    : "border-white/10 opacity-80"
                }`}
                style={{
                  background: isUnlocked
                    ? "linear-gradient(135deg,rgba(217,119,6,0.12),rgba(139,92,246,0.06))"
                    : "hsl(220 20% 11%)",
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border flex-shrink-0 ${
                      isUnlocked ? "border-yellow-500/40" : "border-white/10 grayscale opacity-60"
                    }`}
                    style={{
                      background: isUnlocked
                        ? "linear-gradient(135deg,rgba(217,119,6,0.25),rgba(146,64,14,0.15))"
                        : "rgba(255,255,255,0.05)",
                    }}
                  >
                    {ach.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-sm ${isUnlocked ? "text-white" : "text-muted-foreground"}`}>
                        {ach.title}
                      </p>
                      {isUnlocked && <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5">مكتمل ✓</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{ach.desc}</p>

                    {/* Progress bar (for non-unlocked) */}
                    {!isUnlocked && (
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>{currentVal} / {ach.totalNeeded}</span>
                          <span>{Math.round(pct * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct * 100}%`, background: "linear-gradient(90deg,#d97706,#f59e0b)" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rewards */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-purple-300 font-bold">+{ach.xp} XP</span>
                    <span className="text-[10px] text-yellow-400 font-bold">🪙 {ach.coins}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
