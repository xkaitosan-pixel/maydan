import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getWeeklyLeaderboard, getAllTimeLeaderboard, getMyAllTimeRank, ScoreEntry } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getOrCreateUser } from "@/lib/storage";
import { CATEGORIES } from "@/lib/questions";
import { supabase } from "@/lib/supabase";
import { getCountryFlag } from "@/lib/countryUtils";

interface DailyEntry {
  user_id: string;
  display_name: string;
  country: string;
  score: number;
  total: number;
  completed_at: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];
const MODE_LABELS: Record<string, string> = {
  survival: "🏃 بقاء",
  challenge: "⚔️ تحدي",
  room: "👥 غرفة",
  tournament: "🏆 بطولة",
};

function RelativeTime({ ts }: { ts: string }) {
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return <span>{d}ي</span>;
  if (h >= 1) return <span>{h}س</span>;
  return <span>الآن</span>;
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, signOut } = useAuth();
  const localUser = getOrCreateUser();
  const myName = dbUser?.username ?? localUser.displayName;

  const [tab, setTab] = useState<"weekly" | "alltime" | "daily">("weekly");
  const [category, setCategory] = useState("all");
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setLoading(true);
    if (tab === "daily") {
      setDailyError(null);
      (async () => {
        try {
          const result = await supabase.from("daily_scores")
            .select("user_id, display_name, country, score, total, completed_at")
            .eq("date", today)
            .order("score", { ascending: false })
            .limit(50);
          if (result.error) {
            setDailyError(result.error.message);
          } else {
            setDailyEntries((result.data ?? []) as DailyEntry[]);
          }
        } catch (e) {
          setDailyError(e instanceof Error ? e.message : "خطأ في التحميل");
        } finally {
          setLoading(false);
        }
      })();
    } else {
      const fn = tab === "weekly" ? getWeeklyLeaderboard : getAllTimeLeaderboard;
      fn(category).then(data => {
        setEntries(data);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [tab, category, refreshKey]);

  const myRank = myName ? entries.findIndex(e => e.username === myName) + 1 : -1;

  // When user has scores but is outside the visible top, fetch their global rank.
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  useEffect(() => {
    if (isGuest || !myName || tab !== "alltime") { setGlobalRank(null); return; }
    if (myRank > 0) { setGlobalRank(null); return; }
    let cancelled = false;
    getMyAllTimeRank(myName).then((r) => { if (!cancelled) setGlobalRank(r); });
    return () => { cancelled = true; };
  }, [myName, isGuest, tab, myRank, refreshKey]);

  const categories = [
    { id: "all", name: "الكل", icon: "🌐" },
    ...CATEGORIES.filter(c => !c.isPremium).map(c => ({ id: c.id, name: c.name, icon: c.icon })),
  ];

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
        {/* Tabs */}
        <div className="flex gap-1 p-3 bg-card/50 border-b border-border/30">
          {(["weekly", "alltime", "daily"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === t ? "gradient-gold text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "weekly" ? "هذا الأسبوع" : t === "alltime" ? "كل الوقت" : "📅 اليوم"}
            </button>
          ))}
        </div>

        {/* Category filter (hidden for daily tab) */}
        {tab !== "daily" && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-border/30 no-scrollbar">
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  category === c.id ? "bg-primary text-background border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span>{c.icon}</span><span>{c.name}</span>
              </button>
            ))}
          </div>
        )}

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

        {/* My rank */}
        {!isGuest && myRank > 0 && myName && (
          <div className="mx-3 mt-3 bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span className="text-2xl">{myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`}</span>
            <div>
              <p className="text-sm font-bold">{myName}</p>
              <p className="text-xs text-muted-foreground">مركزك {tab === "weekly" ? "هذا الأسبوع" : "في كل الوقت"}</p>
            </div>
          </div>
        )}
        {!isGuest && myRank <= 0 && globalRank && tab === "alltime" && (
          <div className="mx-3 mt-3 bg-card border border-border/40 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span className="text-lg font-black text-primary">#{globalRank}</span>
            <div className="flex-1">
              <p className="text-sm font-bold">أنت في المركز #{globalRank}</p>
              <p className="text-xs text-muted-foreground">العب أكثر للوصول للقائمة 🏆</p>
            </div>
          </div>
        )}

        {/* Daily list */}
        {tab === "daily" && (
          <div className="p-3 space-y-2 flex-1">
            <div className="text-center py-1">
              <p className="text-xs text-muted-foreground">تحدي اليوم — {today} — {dailyEntries.length} لاعب</p>
            </div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm">جاري التحميل...</p>
              </div>
            ) : dailyError ? (
              <div className="text-center py-14">
                <p className="text-4xl mb-4">⚠️</p>
                <p className="text-foreground font-bold">تعذّر تحميل نتائج اليوم</p>
                <p className="text-xs text-muted-foreground mt-1 px-6 break-all">{dailyError}</p>
                <button onClick={() => setRefreshKey(k => k + 1)}
                  className="mt-4 px-5 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground">
                  🔄 إعادة المحاولة
                </button>
              </div>
            ) : dailyEntries.length === 0 ? (
              <div className="text-center py-14">
                <p className="text-5xl mb-4">📅</p>
                <p className="text-foreground font-bold">لا يوجد نتائج اليوم بعد</p>
                <p className="text-xs text-muted-foreground mt-1 px-6">كن الأول وأنهِ تحدي اليوم</p>
                <button onClick={() => navigate("/daily")}
                  className="mt-5 px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90">
                  العب تحدي اليوم
                </button>
              </div>
            ) : (
              dailyEntries.map((e, i) => {
                const isMe = e.user_id === dbUser?.id;
                return (
                  <div key={e.user_id}
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
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                      style={{
                        background: i === 0 ? "linear-gradient(135deg,#d97706,#f59e0b)"
                          : i === 1 ? "linear-gradient(135deg,#94a3b8,#cbd5e1)"
                          : i === 2 ? "linear-gradient(135deg,#92400e,#d97706)"
                          : "hsl(var(--muted))",
                        color: i < 3 ? "black" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {(e.display_name || "م").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isMe ? "text-secondary" : "text-foreground"}`}>
                        {e.display_name || "لاعب"}{isMe && <span className="text-xs text-secondary mr-1">(أنت)</span>}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {e.country && <span className="text-xs">{getCountryFlag(e.country)}</span>}
                        <span className="text-xs text-muted-foreground">📅 تحدي اليوم</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-500" : "text-primary"}`}>
                        {e.score}
                      </p>
                      <p className="text-xs text-muted-foreground">نقطة</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* List */}
        {tab !== "daily" && <div className="p-3 space-y-2 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              <p className="text-muted-foreground text-sm">جاري التحميل...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-14 fade-in-up">
              <p className="text-5xl mb-4">🏆</p>
              <p className="text-foreground font-bold">لا يوجد متصدرون بعد! كن الأول 🏆</p>
              <p className="text-xs text-muted-foreground mt-1 px-6">
                {isGuest
                  ? "سجّل دخولك وانتهِ من لعبة لتظهر هنا"
                  : "انتهِ من لعبة بوضع البقاء أو الوضع المصنّف وستظهر نتيجتك هنا"}
              </p>
              <div className="flex flex-col gap-2 items-center mt-5">
                <button
                  onClick={() => navigate("/")}
                  className="px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90"
                >العب الآن</button>
                <button
                  onClick={() => setRefreshKey(k => k + 1)}
                  className="text-xs text-muted-foreground hover:text-foreground mt-1"
                >🔄 تحديث القائمة</button>
              </div>
            </div>
          ) : (
            entries.map((e, i) => {
              const isMe = e.username === myName;
              const pct = (e.total && e.total > 0) ? `${Math.round((e.score / e.total) * 100)}%` : `${e.score} نقطة`;
              return (
                <div
                  key={e.id}
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
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                    style={{
                      background: i === 0 ? "linear-gradient(135deg,#d97706,#f59e0b)"
                        : i === 1 ? "linear-gradient(135deg,#94a3b8,#cbd5e1)"
                        : i === 2 ? "linear-gradient(135deg,#92400e,#d97706)"
                        : "hsl(var(--muted))",
                      color: i < 3 ? "black" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {e.username.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${isMe ? "text-secondary" : "text-foreground"}`}>
                      {e.username}{isMe && <span className="text-xs text-secondary mr-1">(أنت)</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{MODE_LABELS[e.game_mode] || e.game_mode}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground"><RelativeTime ts={e.created_at} /></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-black ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-500" : "text-primary"}`}>
                      {e.score}
                    </p>
                    <p className="text-xs text-muted-foreground">{pct}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>}

        <p className="text-center text-xs text-muted-foreground pb-5 px-4">
          {tab === "weekly" ? "🔄 يُعاد الترتيب كل أسبوع" : tab === "alltime" ? "🏆 أفضل النتائج عبر كل الأوقات" : "📅 يُعاد تحدي اليوم كل منتصف ليل"}
        </p>
      </div>
      </div>
    </div>
  );
}
