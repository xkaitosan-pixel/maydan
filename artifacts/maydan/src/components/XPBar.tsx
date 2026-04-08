import { getLevelInfo, LEVELS } from "@/lib/gamification";

interface XPBarProps {
  xp: number;
  coins: number;
  compact?: boolean;
}

export default function XPBar({ xp, coins, compact = false }: XPBarProps) {
  const { current, next, xpInLevel, xpToNext, progress } = getLevelInfo(xp);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-base" title={current.name}>{current.icon}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden min-w-[60px]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#d97706,#f59e0b)" }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-bold">{xp} XP</span>
        <span className="text-xs font-bold text-yellow-400">🪙 {coins}</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-4 border border-white/10 space-y-3"
      style={{ background: "hsl(220 20% 12%)" }}
    >
      {/* Level row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black border border-white/10"
            style={{ background: "linear-gradient(135deg,#d97706,#92400e)" }}
          >
            {current.icon}
          </div>
          <div>
            <p className="text-sm font-black text-white leading-tight">المستوى {current.level}</p>
            <p className="text-xs text-yellow-400 font-bold">{current.name}</p>
          </div>
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1">
            <span className="text-base">🪙</span>
            <span className="text-sm font-black text-yellow-400">{coins.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{xp.toLocaleString()} XP</span>
          {next ? (
            <span>المستوى {next.level}: {next.xp.toLocaleString()} XP</span>
          ) : (
            <span className="text-yellow-400 font-bold">مستوى أقصى 🌟</span>
          )}
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
            style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#d97706,#f59e0b)" }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse" style={{ animationDuration: "2s" }} />
          </div>
        </div>
        {next && (
          <p className="text-[10px] text-muted-foreground mt-1 text-center">
            {(xpToNext - xpInLevel).toLocaleString()} XP للمستوى التالي
          </p>
        )}
      </div>

      {/* Level milestones (mini dots) */}
      <div className="flex justify-between">
        {LEVELS.map((lvl) => (
          <div
            key={lvl.level}
            className="flex flex-col items-center gap-0.5"
            title={`${lvl.name} - ${lvl.xp} XP`}
          >
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border transition-all ${
                xp >= lvl.xp
                  ? "border-yellow-500 bg-yellow-500/20"
                  : "border-white/10 bg-white/5 opacity-40"
              }`}
            >
              {lvl.icon}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
