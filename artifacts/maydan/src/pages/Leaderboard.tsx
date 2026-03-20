import { useState } from "react";
import { useLocation } from "wouter";
import { getWeeklyTop, getAllTimeTop, getMyRank, getOrCreateUser, LeaderboardEntry } from "@/lib/storage";
import { CATEGORIES } from "@/lib/questions";

const MEDALS = ["🥇", "🥈", "🥉"];
const TYPE_LABELS: Record<string, string> = {
  survival: "🏃 بقاء",
  challenge: "⚔️ تحدي",
  room: "👥 غرفة",
  tournament: "🏆 بطولة",
};

function RelativeTime({ ts }: { ts: number }) {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return <span>{d}ي</span>;
  if (h >= 1) return <span>{h}س</span>;
  return <span>الآن</span>;
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"weekly" | "alltime">("weekly");
  const [category, setCategory] = useState("all");
  const user = getOrCreateUser();

  const entries: LeaderboardEntry[] = tab === "weekly"
    ? getWeeklyTop(category)
    : getAllTimeTop(category);

  const myRank = user.displayName ? getMyRank(user.displayName, tab === "weekly") : -1;

  const categories = [
    { id: "all", name: "الكل", icon: "🌐" },
    ...CATEGORIES.filter(c => !c.isPremium).map(c => ({ id: c.id, name: c.name, icon: c.icon })),
  ];

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
        <h1 className="text-lg font-bold">🏆 لوحة المتصدرين</h1>
      </header>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Tabs */}
        <div className="flex gap-1 p-3 bg-card/50 border-b border-border/30">
          <button
            onClick={() => setTab("weekly")}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === "weekly" ? "gradient-gold text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            هذا الأسبوع
          </button>
          <button
            onClick={() => setTab("alltime")}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === "alltime" ? "gradient-gold text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            كل الوقت
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-border/30 no-scrollbar">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                category === c.id
                  ? "bg-primary text-background border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <span>{c.icon}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        {/* My rank banner */}
        {myRank > 0 && user.displayName && (
          <div className="mx-3 mt-3 bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span className="text-2xl">{myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`}</span>
            <div>
              <p className="text-sm font-bold text-foreground">{user.displayName}</p>
              <p className="text-xs text-muted-foreground">مركزك {tab === "weekly" ? "هذا الأسبوع" : "في كل الوقت"}</p>
            </div>
          </div>
        )}

        {/* List */}
        <div className="p-3 space-y-2 flex-1">
          {entries.length === 0 ? (
            <div className="text-center py-16 fade-in-up">
              <p className="text-5xl mb-4">🏆</p>
              <p className="text-muted-foreground font-bold">لا توجد نتائج بعد</p>
              <p className="text-xs text-muted-foreground mt-1">العب أي وضع لتظهر هنا!</p>
              <button
                onClick={() => navigate("/")}
                className="mt-5 px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90"
              >
                العب الآن
              </button>
            </div>
          ) : (
            entries.map((e, i) => {
              const isMe = e.name === user.displayName;
              const pct = e.total > 0 ? Math.round((e.score / e.total) * 100) : e.score;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                    i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                    i === 1 ? "bg-slate-400/10 border-slate-400/20" :
                    i === 2 ? "bg-orange-700/10 border-orange-700/20" :
                    isMe ? "bg-secondary/10 border-secondary/30" :
                    "bg-card border-border"
                  }`}
                >
                  {/* Rank */}
                  <div className="w-9 text-center shrink-0">
                    {i < 3
                      ? <span className="text-2xl">{MEDALS[i]}</span>
                      : <span className="text-lg font-black text-muted-foreground">#{i + 1}</span>
                    }
                  </div>

                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                    style={{
                      background: i === 0 ? "linear-gradient(135deg,#d97706,#f59e0b)"
                        : i === 1 ? "linear-gradient(135deg,#94a3b8,#cbd5e1)"
                        : i === 2 ? "linear-gradient(135deg,#92400e,#d97706)"
                        : "hsl(var(--muted))",
                      color: i < 3 ? "black" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {e.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-bold truncate ${isMe ? "text-secondary" : "text-foreground"}`}>
                        {e.name}
                        {isMe && <span className="text-xs text-secondary"> (أنت)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{TYPE_LABELS[e.type] || e.type}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground"><RelativeTime ts={e.date} /></span>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-black ${
                      i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-600" : "text-primary"
                    }`}>{e.score}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.total > 0 ? `${pct}%` : "نقطة"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reset note */}
        <p className="text-center text-xs text-muted-foreground pb-5 px-4">
          {tab === "weekly" ? "🔄 يُعاد الترتيب كل أحد" : "🏆 أفضل النتائج عبر كل الأوقات"}
        </p>
      </div>
    </div>
  );
}
