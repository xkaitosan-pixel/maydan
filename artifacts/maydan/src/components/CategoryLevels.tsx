import { engagementFrom, getAllCategoryLevels, CATEGORY_MASTERY_LEVEL } from "@/lib/engagement";

interface CategoryLevelsProps {
  achievements: unknown;
}

export default function CategoryLevels({ achievements }: CategoryLevelsProps) {
  const state = engagementFrom(achievements);
  const levels = getAllCategoryLevels(state);
  const sorted = [...levels].sort((a, b) => b.level.xp - a.level.xp);

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground">📊 مستويات الفئات</h3>
        <span className="text-[10px] text-muted-foreground">إتقان عند المستوى {CATEGORY_MASTERY_LEVEL}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {sorted.map(c => {
          const pct = (c.level.intoLevel / c.level.needed) * 100;
          return (
            <div
              key={c.id}
              className="relative rounded-2xl border bg-card p-3"
              style={{
                borderColor: c.level.mastered ? "rgba(245,158,11,0.5)" : "var(--border, rgba(255,255,255,0.1))",
                boxShadow: c.level.mastered ? "0 0 14px rgba(245,158,11,0.25)" : "none",
              }}
            >
              {c.level.mastered && (
                <span className="absolute -left-1.5 -top-1.5 rounded-full bg-yellow-500 px-1.5 py-0.5 text-[9px] font-black text-black shadow">
                  👑 إتقان
                </span>
              )}
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xl">{c.icon}</span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-foreground">{c.name}</p>
                  <p className="text-[10px] text-primary">المستوى {c.level.level}</p>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: c.level.mastered
                      ? "linear-gradient(90deg,#d97706,#f59e0b)"
                      : "linear-gradient(90deg,#7c3aed,#a855f7)",
                  }}
                />
              </div>
              <p className="mt-1 text-right text-[9px] text-muted-foreground">
                {c.level.mastered ? "أعلى مستوى" : `${c.level.intoLevel}/${c.level.needed} خبرة`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
