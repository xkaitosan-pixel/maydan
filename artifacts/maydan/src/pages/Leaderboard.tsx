import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { getCountryFlag } from "@/lib/countryUtils";
import { SkeletonLeaderboard } from "@/components/Skeleton";
import { friendlyErrorText } from "@/lib/errors";
import { ACHIEVEMENTS, parseAchievementsData } from "@/lib/gamification";

interface RankedEntry {
  id: string;
  username: string;
  display_name: string | null;
  country: string | null;
  total_points: number;
  season_points: number | null;
  total_wins: number | null;
  avatar_url: string | null;
  achievements: unknown;
}

// Pick the most prestigious unlocked badge (highest XP reward) for an entry.
function getTopBadge(achievements: unknown): { icon: string; title: string } | null {
  const ad = parseAchievementsData(achievements);
  if (!ad.unlocked || ad.unlocked.length === 0) return null;
  const owned = ACHIEVEMENTS.filter((a) => ad.unlocked.includes(a.id));
  if (owned.length === 0) return null;
  owned.sort((a, b) => b.xp - a.xp);
  return { icon: owned[0].icon, title: owned[0].title };
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, signOut } = useAuth();

  const [tab, setTab] = useState<"weekly" | "alltime">("alltime");
  const [entries, setEntries] = useState<RankedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [myRankNum, setMyRankNum] = useState<number | null>(null);

  const sortField = tab === "weekly" ? "season_points" : "total_points";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await supabase
          .from("users")
          .select("id, username, display_name, country, total_points, season_points, total_wins, avatar_url, achievements")
          .gt(sortField, 0)
          .order(sortField, { ascending: false })
          .order("total_wins", { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (result.error) {
          setError(friendlyErrorText(result.error));
        } else {
          setEntries((result.data ?? []) as RankedEntry[]);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyErrorText(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, refreshKey, sortField]);

  // Resolve "أنت في المركز #X" — count players above the current user
  useEffect(() => {
    let cancelled = false;
    if (isGuest || !dbUser?.id) { setMyRankNum(null); return; }
    const myScore = (tab === "weekly" ? dbUser.season_points : dbUser.total_points) ?? 0;
    const myWins = dbUser.total_wins ?? 0;
    if (myScore <= 0) { setMyRankNum(null); return; }
    (async () => {
      // Players ranked strictly above me: higher score, OR same score and more wins (matches list ordering).
      const above = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gt(sortField, myScore);
      const tied = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq(sortField, myScore)
        .gt("total_wins", myWins);
      if (cancelled) return;
      setMyRankNum((above.count ?? 0) + (tied.count ?? 0) + 1);
    })();
    return () => { cancelled = true; };
  }, [tab, dbUser?.id, dbUser?.total_points, dbUser?.season_points, refreshKey, sortField, isGuest]);

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      <div className="rp-medium flex flex-col flex-1 w-full">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">🏆 لوحة المتصدرين</h1>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground text-lg disabled:opacity-40 transition-opacity"
            title="تحديث"
          >{loading ? "⏳" : "🔄"}</button>
          {isGuest && (
            <button
              onClick={async () => { await signOut(); }}
              className="mr-auto text-xs px-2.5 py-1 rounded-full font-semibold transition-opacity hover:opacity-80"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#000" }}
            >تسجيل الدخول 👑</button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Tabs: weekly + all-time only */}
          <div className="flex gap-1 p-3 bg-card/50 border-b border-border/30">
            {(["weekly", "alltime"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === t ? "gradient-gold text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t === "weekly" ? "هذا الأسبوع" : "كل الوقت"}
              </button>
            ))}
          </div>

          {/* Guest CTA */}
          {isGuest && (
            <div className="mx-3 mt-3 rounded-xl border border-primary/30 px-4 py-3 text-center"
              style={{ background: "linear-gradient(135deg,rgba(217,119,6,0.12),rgba(245,158,11,0.08))" }}>
              <p className="font-bold text-sm text-primary">سجّل دخولك لتظهر في لوحة المتصدرين 👑</p>
              <p className="text-xs text-muted-foreground mt-0.5">النتائج محفوظة فقط للمسجّلين</p>
              <button
                onClick={async () => { await signOut(); }}
                className="mt-2.5 px-5 py-1.5 rounded-xl text-xs font-bold text-background hover:opacity-90 transition"
                style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
              >تسجيل الدخول</button>
            </div>
          )}

          {/* List */}
          <div className="p-3 space-y-2 flex-1">
            <div className="text-center py-1">
              <p className="text-xs text-muted-foreground">
                🏆 ترتيب اللاعبين حسب {tab === "weekly" ? "نقاط الأسبوع" : "مجموع النقاط"} — {entries.length} لاعب
              </p>
            </div>

            {loading ? (
              <SkeletonLeaderboard rows={8} />
            ) : error ? (
              <div className="text-center py-14">
                <p className="text-4xl mb-4">⚠️</p>
                <p className="text-foreground font-bold">تعذّر تحميل التصنيف</p>
                <p className="text-xs text-muted-foreground mt-1 px-6 break-all">{error}</p>
                <button onClick={() => setRefreshKey(k => k + 1)}
                  className="mt-4 px-5 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground">
                  🔄 إعادة المحاولة
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-14">
                <p className="text-5xl mb-4">🏆</p>
                <p className="text-foreground font-bold">لا يوجد متصدرون بعد</p>
                <p className="text-xs text-muted-foreground mt-1 px-6">العب الوضع المصنّف لتظهر هنا</p>
                <button onClick={() => navigate("/ranked")}
                  className="mt-5 px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90">
                  ابدأ مباراة مصنّفة
                </button>
              </div>
            ) : (
              entries.map((e, i) => {
                const isMe = e.id === dbUser?.id;
                const name = e.display_name || e.username || "لاعب";
                const score = (tab === "weekly" ? e.season_points : e.total_points) ?? 0;
                return (
                  <div key={e.id}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                      i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                      i === 1 ? "bg-slate-400/10 border-slate-400/20" :
                      i === 2 ? "bg-orange-700/10 border-orange-700/20" :
                      isMe ? "bg-secondary/10 border-secondary/30" :
                      "bg-card border-border"
                    }`}
                  >
                    <div className="w-9 text-center shrink-0">
                      {i < 3 ? <span className="text-2xl">{MEDALS[i]}</span>
                        : <span className="text-lg font-black text-muted-foreground">#{i + 1}</span>}
                    </div>
                    {e.avatar_url ? (
                      <img src={e.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border border-border" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                        style={{
                          background: i === 0 ? "linear-gradient(135deg,#d97706,#f59e0b)"
                            : i === 1 ? "linear-gradient(135deg,#94a3b8,#cbd5e1)"
                            : i === 2 ? "linear-gradient(135deg,#92400e,#d97706)"
                            : "hsl(var(--muted))",
                          color: i < 3 ? "black" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const badge = getTopBadge(e.achievements);
                          return badge ? (
                            <span
                              title={badge.title}
                              className="text-base shrink-0"
                              aria-label={badge.title}
                            >
                              {badge.icon}
                            </span>
                          ) : null;
                        })()}
                        <p className={`text-sm font-bold truncate ${isMe ? "text-secondary" : "text-foreground"}`}>
                          {name}{isMe && <span className="text-xs text-secondary mr-1">(أنت)</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {e.country && <span className="text-xs">{getCountryFlag(e.country)}</span>}
                        <span className="text-xs text-muted-foreground">🏆 {e.total_wins ?? 0} انتصار</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-500" : "text-primary"}`}>
                        {score.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">نقطة</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: my rank */}
          {!isGuest && myRankNum !== null && (
            <div className="mx-3 mb-3 bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">{myRankNum <= 3 ? MEDALS[myRankNum - 1] : `#${myRankNum}`}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-secondary">أنت في المركز #{myRankNum}</p>
                <p className="text-xs text-muted-foreground">{tab === "weekly" ? "في تصنيف الأسبوع" : "في التصنيف العام"}</p>
              </div>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pb-5 px-4">
            {tab === "weekly" ? "🔄 يُعاد ترتيب الأسبوع كل سبت" : "🏆 أفضل اللاعبين عبر كل الأوقات"}
          </p>
        </div>
      </div>
    </div>
  );
}
