import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  getOrCreateUser, updateDisplayName, canCreateChallenge,
  getActiveNotifications, AppNotification, updateStreak
} from "@/lib/storage";
import { useAuth } from "@/lib/AuthContext";
import { syncStreak } from "@/lib/db";
import { Button } from "@/components/ui/button";
import StreakMilestone from "@/components/StreakMilestone";
import RewardBox from "@/components/RewardBox";
import NotificationBanner from "@/components/NotificationBanner";
import XPBar from "@/components/XPBar";
import { toggleTheme, getTheme } from "@/lib/theme";
import LogoIcon from "@/components/LogoIcon";
import { isSoundEnabled, toggleSound, playClick, playSound } from "@/lib/sound";
import {
  parseAchievementsData, ACHIEVEMENTS, getSeasonTier, getDaysUntilSunday,
  getCurrentSeasonWeek, checkSeasonReset,
} from "@/lib/gamification";
import { getCountryFlag } from "@/lib/countryUtils";

const STREAK_POPUP_KEY = "maydan_streak_popup_v1";
function wasStreakShownToday(milestone: number): boolean {
  try {
    const s = localStorage.getItem(STREAK_POPUP_KEY);
    if (!s) return false;
    const { date, m } = JSON.parse(s);
    return date === new Date().toISOString().slice(0, 10) && m === milestone;
  } catch { return false; }
}
function markStreakShown(milestone: number) {
  localStorage.setItem(STREAK_POPUP_KEY, JSON.stringify({
    date: new Date().toISOString().slice(0, 10), m: milestone,
  }));
}

export default function Home() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, signOut, refreshUser, googleDisplayName } = useAuth();

  const [guestName, setGuestName] = useState("");
  const [hasGuestName, setHasGuestName] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [streak, setStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [isDark, setIsDark] = useState(() => getTheme() === "dark");
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [seasonRewardMsg, setSeasonRewardMsg] = useState<string | null>(null);

  function handleThemeToggle() {
    playClick();
    toggleTheme();
    setIsDark((prev) => !prev);
  }

  function handleSoundToggle() {
    const next = toggleSound();
    setSoundOn(next);
    if (next) playSound("correct");
  }

  const displayName = dbUser?.username ?? (hasGuestName ? guestName : "");
  const isPremium = dbUser?.is_premium ?? getOrCreateUser().isPremium;
  const canCreate = canCreateChallenge();

  useEffect(() => {
    if (isGuest) {
      const user = getOrCreateUser();
      if (user.displayName) {
        setGuestName(user.displayName);
        setHasGuestName(true);
      }
      const hit = updateStreak();
      if (hit && !wasStreakShownToday(hit)) { setMilestone(hit); markStreakShown(hit); }
      setStreak(user.streak);
      setLongestStreak(user.longestStreak);
      setNotifications(getActiveNotifications());
      return;
    }
    if (dbUser?.id) {
      syncStreak(dbUser.id).then(result => {
        if (result) {
          setStreak(result.streak_count);
          setLongestStreak(result.longest_streak);
          const ms = result.streak_count;
          if ([3, 7, 30].includes(ms) && !wasStreakShownToday(ms)) { setMilestone(ms); markStreakShown(ms); }
          refreshUser();
        }
      });
      // Season reset check
      checkSeasonReset(
        dbUser.id,
        dbUser.achievements,
        dbUser.season_points ?? 0,
        dbUser.coins ?? 0,
      ).then(reset => {
        if (reset) {
          setSeasonRewardMsg(`🏆 الموسم انتهى! حصلت على ${reset.coinsAwarded} قرش (${reset.tierName})`);
          setTimeout(() => setSeasonRewardMsg(null), 5000);
          refreshUser();
        }
      });
    }
    setNotifications(getActiveNotifications());
  }, [dbUser?.id, isGuest]);

  function handleGuestSaveName() {
    if (!guestName.trim()) return;
    updateDisplayName(guestName.trim());
    setHasGuestName(true);
    const hit = updateStreak();
    if (hit) setMilestone(hit);
    setNotifications(getActiveNotifications());
  }

  const localUser = getOrCreateUser();
  const showContent = !!displayName;

  const modes = [
    {
      id: "challenge", icon: "⚔️", label: "تحدي", sub: "تحدي صديق أو غريب",
      gradient: "linear-gradient(135deg, #d97706, #f59e0b)",
      onClick: () => canCreate ? navigate("/create") : undefined,
      disabled: !canCreate,
    },
    {
      id: "survival", icon: "🏃", label: "وضع البقاء", sub: "كم تصمد؟",
      gradient: "linear-gradient(135deg, #dc2626, #ef4444)",
      onClick: () => navigate("/survival"),
    },
    {
      id: "party", icon: "📺", label: "وضع التجمعات", sub: "العب مع الجماعة",
      gradient: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
      onClick: () => navigate("/party"),
    },
    {
      id: "daily", icon: "📅", label: "تحدي اليوم", sub: "5 أسئلة يومية",
      gradient: "linear-gradient(135deg, #0c4a6e, #0369a1)",
      onClick: () => navigate("/daily"),
    },
    {
      id: "ranked", icon: "🏆", label: "المتصدرون", sub: "تنافس أونلاين",
      gradient: "linear-gradient(135deg, #d97706, #ca8a04)",
      onClick: () => navigate("/ranked"),
    },
  ];

  const aData           = parseAchievementsData(dbUser?.achievements);
  const lastUnlocked    = aData.unlocked.slice(-3).map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean) as typeof ACHIEVEMENTS;
  const seasonPoints    = dbUser?.season_points ?? 0;
  const seasonTier      = getSeasonTier(seasonPoints);
  const daysUntilReset  = getDaysUntilSunday();

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col">
      {milestone && <StreakMilestone days={milestone} onClose={() => setMilestone(null)} />}
      {seasonRewardMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 font-bold text-sm text-white shadow-xl bg-yellow-600 border border-yellow-500/50">
          {seasonRewardMsg}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="px-4 md:px-8 pt-4 pb-3 flex justify-between items-center border-b border-border/30">
        <div className="flex items-center gap-2">
          <LogoIcon size={36} />
          <span className="text-xl md:text-2xl font-black text-primary">ميدان</span>
        </div>
        <div className="flex items-center gap-2">
          {!isGuest && dbUser && (dbUser.coins ?? 0) > 0 && (
            <div className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/30 rounded-full px-2.5 py-1">
              <span className="text-sm">🪙</span>
              <span className="text-xs font-bold text-yellow-400">{(dbUser.coins ?? 0).toLocaleString()}</span>
            </div>
          )}
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 rounded-full px-2.5 py-1">
              <span className="text-sm">🔥</span>
              <span className="text-xs font-bold text-orange-400">{streak}</span>
            </div>
          )}
          <button onClick={handleSoundToggle}
            className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-base"
            title={soundOn ? "كتم الأصوات" : "تشغيل الأصوات"}
          >{soundOn ? "🔊" : "🔇"}</button>
          <button onClick={handleThemeToggle}
            className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-base"
            title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
          >{isDark ? "🌙" : "☀️"}</button>
          {!isGuest && dbUser?.avatar_url ? (
            <img src={dbUser.avatar_url} alt={displayName}
              className="w-9 h-9 rounded-full border-2 border-primary object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate("/profile")} />
          ) : showContent && (
            <button onClick={() => navigate("/profile")}
              className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="الملف الشخصي"
            >👤</button>
          )}
          {showContent && (
            <button onClick={signOut}
              className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm"
              title="تسجيل الخروج"
            >⬚</button>
          )}
        </div>
      </header>

      {/* Notifications */}
      {showContent && notifications.length > 0 && (
        <NotificationBanner notifications={notifications} />
      )}

      {/* ── Main body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* home-desktop activates CSS grid (340px | 1fr) at ≥768px via index.css */}
        <div className="home-desktop py-5 px-4">

            {/* ── LEFT COLUMN: Identity + stats ──────────────────────────── */}
            <div className="md:w-[340px] md:flex-shrink-0 space-y-5">

              {/* Hero logo */}
              <div className="text-center pt-2 md:pt-6">
                <div className="gold-glow mb-3 mx-auto w-fit rounded-3xl">
                  <LogoIcon size={96} />
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-primary">ميدان</h1>
                <p className="text-secondary text-sm md:text-base font-semibold mt-1">تحدي المعرفة العربي</p>
              </div>

              {/* Streak banner */}
              {showContent && streak > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/25 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-3xl">🔥</span>
                  <div>
                    <p className="font-bold text-orange-400 text-sm">{streak} يوم متتالي!</p>
                    <p className="text-xs text-muted-foreground">
                      {streak >= 30 ? "أسطوري 👑" : streak >= 7 ? "رائع! استمر ⚡" : "استمر تكسب شارات 🎯"}
                    </p>
                  </div>
                  <div className="mr-auto text-xs text-muted-foreground">أفضل: {longestStreak} 🏆</div>
                </div>
              )}

              {/* Guest name input */}
              {isGuest && !hasGuestName ? (
                <div className="space-y-3 fade-in-up">
                  <p className="text-sm text-muted-foreground text-center">أدخل اسمك للبدء:</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 h-11 bg-card border border-border rounded-xl px-3 text-right text-foreground placeholder:text-muted-foreground outline-none"
                      placeholder="اسمك هنا..."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGuestSaveName()}
                      maxLength={20}
                    />
                    <Button onClick={handleGuestSaveName} disabled={!guestName.trim()} className="gradient-gold text-background font-bold hover:opacity-90 shrink-0">ابدأ</Button>
                  </div>
                  <div className="text-center">
                    <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">
                      سجّل الدخول بدلاً من ذلك →
                    </button>
                  </div>
                </div>
              ) : !isGuest && !dbUser ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                </div>
              ) : showContent && (
                <>
                  {/* Welcome */}
                  {!isGuest && dbUser?.avatar_url ? (
                    <div className="text-center">
                      <div className="relative w-16 h-16 md:w-20 md:h-20 mx-auto mb-2 cursor-pointer" onClick={() => navigate("/profile")}>
                        <img src={dbUser.avatar_url} alt={displayName}
                          className="w-full h-full rounded-full border-3 border-primary object-cover gold-glow"
                          style={{ border: "3px solid hsl(var(--primary))" }} />
                        {isPremium && <span className="absolute -bottom-1 -right-1 text-base">👑</span>}
                      </div>
                      <h2 className="text-xl md:text-2xl font-black text-foreground flex items-center justify-center gap-2 cursor-pointer" onClick={() => navigate("/profile")}>
                        {dbUser?.country && <span>{getCountryFlag(dbUser.country)}</span>}
                        أهلاً {googleDisplayName || displayName}! {isPremium ? "👑" : "⚔️"}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isPremium ? "عضو ميدان برو" : "مستعد للتحدي؟"}
                      </p>
                      {!canCreate && <p className="text-xs text-destructive mt-1">وصلت للحد اليومي المجاني ⛔</p>}
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 cursor-pointer" onClick={() => !isGuest && navigate("/profile")}>
                        <p className="text-muted-foreground text-sm">
                          مرحباً، <span className="text-foreground font-bold">{displayName}</span>
                          {!isGuest && dbUser?.country && <span className="mr-1">{getCountryFlag(dbUser.country)}</span>}
                          {isPremium && <span className="text-yellow-400 mr-1 text-xs">👑 برو</span>}
                          {isGuest && <span className="text-muted-foreground text-xs mr-1">(ضيف)</span>}
                        </p>
                      </div>
                      {!canCreate && <p className="text-xs text-destructive mt-1">وصلت للحد اليومي المجاني ⛔</p>}
                    </div>
                  )}

                  {/* XP Bar */}
                  {!isGuest && dbUser && (
                    <XPBar xp={dbUser.xp ?? 0} coins={dbUser.coins ?? 0} />
                  )}

                  {/* Season Widget */}
                  {!isGuest && dbUser && (
                    <div
                      className="rounded-2xl p-3 border border-white/10 flex items-center gap-3"
                      style={{ background: "hsl(220 20% 12%)" }}
                    >
                      <span className="text-2xl">{seasonTier.icon}</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white">موسم الأسبوع</p>
                        <p className="text-[10px] text-muted-foreground">{seasonTier.name} • {seasonPoints} نقطة</p>
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] text-muted-foreground">ينتهي خلال</p>
                        <p className="text-xs font-bold text-yellow-400">{daysUntilReset} أيام</p>
                      </div>
                    </div>
                  )}

                  {/* Quick stats */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "الانتصارات", value: dbUser?.total_wins ?? localUser.wins },
                      { label: "النقاط", value: dbUser?.total_points ?? 0 },
                      { label: "بقاء أفضل", value: localUser.stats.survivalBest },
                      { label: "الستريك", value: streak },
                    ].map((s) => (
                      <div key={s.label} className="bg-card border border-border rounded-xl p-2 text-center card-hover">
                        <p className="text-lg md:text-xl font-black text-primary">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Recent achievements */}
                  {!isGuest && lastUnlocked.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-semibold tracking-wider">آخر الإنجازات</p>
                      <div className="flex gap-2">
                        {lastUnlocked.map(a => (
                          <button
                            key={a.id}
                            onClick={() => navigate("/achievements")}
                            className="flex-1 rounded-xl p-2 border border-yellow-500/20 flex items-center gap-1.5 hover:border-yellow-500/40 transition-colors"
                            style={{ background: "rgba(217,119,6,0.08)" }}
                          >
                            <span className="text-base">{a.icon}</span>
                            <span className="text-[10px] text-yellow-400 font-bold leading-tight truncate">{a.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom links */}
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                    <button onClick={() => navigate("/stats")} className="text-xs text-secondary hover:text-secondary/80 transition-colors">
                      📊 إحصائياتي
                    </button>
                    <span className="text-border">|</span>
                    <button onClick={() => navigate("/leaderboard")} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                      🏆 المتصدرون
                    </button>
                    {!isGuest && (
                      <>
                        <span className="text-border">|</span>
                        <button onClick={() => navigate("/achievements")} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                          🏅 الإنجازات
                        </button>
                        <span className="text-border">|</span>
                        <button onClick={() => navigate("/store")} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                          🛍️ المتجر
                        </button>
                      </>
                    )}
                    <span className="text-border">|</span>
                    {isPremium ? (
                      <span className="text-xs text-yellow-400 font-bold">👑 برو مفعّل</span>
                    ) : (
                      <button onClick={() => navigate("/premium")} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors font-bold">
                        👑 ترقية إلى برو
                      </button>
                    )}
                    {isGuest && (
                      <>
                        <span className="text-border">|</span>
                        <button onClick={signOut} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          🔵 سجّل الدخول
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Feature pills — desktop: in left column */}
              <div className="hidden md:flex flex-wrap justify-center gap-2 pt-2">
                {["⏱️ 30 ثانية", "🃏 بطاقات القوة", "📲 واتساب", "🔥 ستريك يومي", "🎁 مكافأة يومية"].map((f) => (
                  <span key={f} className="bg-card border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">{f}</span>
                ))}
              </div>
            </div>

            {/* ── RIGHT COLUMN: Game modes ──────────────────────────────── */}
            {showContent ? (
              <div className="flex-1 space-y-4 mt-5 md:mt-0 md:pt-6">
                <RewardBox />

                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-3 text-center tracking-wider">اختر وضع اللعب</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    {modes.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={mode.onClick}
                        disabled={mode.disabled}
                        className={`relative rounded-2xl p-4 md:p-6 text-center transition-all ${mode.disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.03] active:scale-[0.97]"}`}
                        style={{ background: mode.gradient, border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <span className="block text-3xl md:text-4xl mb-1.5">{mode.icon}</span>
                        <p className="text-white font-black text-sm md:text-base leading-tight">{mode.label}</p>
                        <p className="text-white/70 text-xs md:text-sm mt-0.5">{mode.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile-only feature pills */}
                <div className="flex md:hidden flex-wrap justify-center gap-2">
                  {["⏱️ 30 ثانية", "🃏 بطاقات القوة", "📲 واتساب", "🔥 ستريك يومي", "🎁 مكافأة يومية"].map((f) => (
                    <span key={f} className="bg-card border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">{f}</span>
                  ))}
                </div>
              </div>
            ) : (
              /* Right side placeholder when not signed in yet */
              <div className="flex-1 mt-5 md:mt-0" />
            )}
        </div>
      </div>

      <footer className="py-3 text-center text-xs text-muted-foreground border-t border-border/30">
        <span className="text-primary">ميدان</span> — {isGuest ? "الوضع الضيف (ميزات محدودة)" : "النسخة المجانية: 5 تحديات يومياً"}
      </footer>
    </div>
  );
}
