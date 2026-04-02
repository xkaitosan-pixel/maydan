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
import { toggleTheme, getTheme } from "@/lib/theme";
import { isSoundEnabled, toggleSound, playClick } from "@/lib/sound";

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

  // Local state (for guests or pending name entry)
  const [guestName, setGuestName] = useState("");
  const [hasGuestName, setHasGuestName] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [streak, setStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [isDark, setIsDark] = useState(() => getTheme() === "dark");
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  function handleThemeToggle() {
    playClick();
    toggleTheme();
    setIsDark((prev) => !prev);
  }

  function handleSoundToggle() {
    const next = toggleSound();
    setSoundOn(next);
    if (next) playClick();
  }

  // Decide the display name
  const displayName = dbUser?.username ?? (hasGuestName ? guestName : "");
  const isPremium = dbUser?.is_premium ?? getOrCreateUser().isPremium;
  const canCreate = canCreateChallenge();

  useEffect(() => {
    if (isGuest) {
      // Guest: use localStorage user
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

    // Authenticated user — sync streak to Supabase
    if (dbUser?.id) {
      syncStreak(dbUser.id).then(result => {
        if (result) {
          setStreak(result.streak_count);
          setLongestStreak(result.longest_streak);
          // Check milestone
          const ms = result.streak_count;
          if ([3, 7, 30].includes(ms) && !wasStreakShownToday(ms)) { setMilestone(ms); markStreakShown(ms); }
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
      id: "survival", icon: "🏃", label: "وضع البقاء", sub: "كم تصمد؟",
      gradient: "linear-gradient(135deg, #dc2626, #ef4444)",
      onClick: () => navigate("/survival"),
    },
    {
      id: "challenge", icon: "⚔️", label: "تحدي ثنائي", sub: "١ ضد ١",
      gradient: "linear-gradient(135deg, #d97706, #f59e0b)",
      onClick: () => canCreate ? navigate("/create") : undefined,
      disabled: !canCreate,
    },
    {
      id: "room", icon: "👥", label: "غرفة أصدقاء", sub: "2-8 لاعبين",
      gradient: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
      onClick: () => navigate("/room"),
    },
    {
      id: "tournament", icon: "🏆", label: "بطولة", sub: "إقصاء مباشر",
      gradient: "linear-gradient(135deg, #d97706, #ca8a04)",
      onClick: () => navigate("/tournament"),
    },
  ];

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col">
      {milestone && <StreakMilestone days={milestone} onClose={() => setMilestone(null)} />}

      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex justify-between items-center border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center text-background font-bold text-base">م</div>
          <span className="text-xl font-black text-primary">ميدان</span>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 rounded-full px-2.5 py-1">
              <span className="text-sm">🔥</span>
              <span className="text-xs font-bold text-orange-400">{streak}</span>
            </div>
          )}
          {/* Sound toggle */}
          <button
            onClick={handleSoundToggle}
            className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-base"
            title={soundOn ? "كتم الأصوات" : "تشغيل الأصوات"}
          >{soundOn ? "🔊" : "🔇"}</button>
          {/* Theme toggle */}
          <button
            onClick={handleThemeToggle}
            className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-base"
            title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
          >{isDark ? "🌙" : "☀️"}</button>
          {/* Avatar / User indicator */}
          {!isGuest && dbUser?.avatar_url ? (
            <img
              src={dbUser.avatar_url}
              alt={displayName}
              className="w-9 h-9 rounded-full border-2 border-primary object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate("/stats")}
            />
          ) : showContent && (
            <button
              onClick={() => navigate("/stats")}
              className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >📊</button>
          )}
          {/* Logout */}
          {showContent && (
            <button
              onClick={signOut}
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

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 pb-8">
        {/* Hero */}
        <div className="text-center pt-2">
          <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center gold-glow mb-3 mx-auto">
            <span className="text-4xl">⚔️</span>
          </div>
          <h1 className="text-4xl font-black text-primary">ميدان</h1>
          <p className="text-secondary text-sm font-semibold mt-1">تحدي المعرفة العربي</p>
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
                <div className="relative w-16 h-16 mx-auto mb-2 cursor-pointer" onClick={() => navigate("/stats")}>
                  <img
                    src={dbUser.avatar_url}
                    alt={displayName}
                    className="w-16 h-16 rounded-full border-3 border-primary object-cover gold-glow"
                    style={{ border: "3px solid hsl(var(--primary))" }}
                  />
                  {isPremium && (
                    <span className="absolute -bottom-1 -right-1 text-base">👑</span>
                  )}
                </div>
                <h2 className="text-xl font-black text-foreground">
                  أهلاً {googleDisplayName || displayName}! {isPremium ? "👑" : "⚔️"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPremium ? "عضو ميدان برو" : "مستعد للتحدي؟"}
                </p>
                {!canCreate && <p className="text-xs text-destructive mt-1">وصلت للحد اليومي المجاني ⛔</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-muted-foreground text-sm">
                    مرحباً، <span className="text-foreground font-bold">{displayName}</span>
                    {isPremium && <span className="text-yellow-400 mr-1 text-xs">👑 برو</span>}
                    {isGuest && <span className="text-muted-foreground text-xs mr-1">(ضيف)</span>}
                  </p>
                </div>
                {!canCreate && <p className="text-xs text-destructive mt-1">وصلت للحد اليومي المجاني ⛔</p>}
              </div>
            )}

            <RewardBox />

            {/* Mode selector */}
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-3 text-center tracking-wider">اختر وضع اللعب</p>
              <div className="grid grid-cols-2 gap-3">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={mode.onClick}
                    disabled={mode.disabled}
                    className={`relative rounded-2xl p-4 text-center transition-all ${mode.disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.03] active:scale-[0.97]"}`}
                    style={{ background: mode.gradient, border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <span className="block text-3xl mb-1.5">{mode.icon}</span>
                    <p className="text-white font-black text-sm leading-tight">{mode.label}</p>
                    <p className="text-white/70 text-xs mt-0.5">{mode.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Party Mode button */}
            <button
              onClick={() => navigate("/party")}
              className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81)", border: "2px solid rgba(139,92,246,0.5)" }}
            >
              <span className="text-2xl">📺</span>
              <div className="text-right">
                <p className="text-white font-black text-sm leading-tight">وضع التجمعات</p>
                <p className="text-purple-300 text-xs font-normal">العب مع الأصدقاء على شاشة كبيرة</p>
              </div>
              {!isPremium && <span className="mr-auto bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-bold">جديد ✨</span>}
            </button>

            {/* Ranked Mode button */}
            <button
              onClick={() => navigate("/ranked")}
              className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#7c2d12,#c2410c)", border: "2px solid rgba(249,115,22,0.5)" }}
            >
              <span className="text-2xl">⚡</span>
              <div className="text-right">
                <p className="text-white font-black text-sm leading-tight">تحدي المتصدرين</p>
                <p className="text-orange-300 text-xs font-normal">1v1 مصنّف — تسابق لتصعيد رتبتك</p>
              </div>
              <span className="mr-auto bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs px-2 py-0.5 rounded-full font-bold">مصنّف ⚡</span>
            </button>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "الانتصارات", value: dbUser?.total_wins ?? localUser.wins },
                { label: "النقاط", value: dbUser?.total_points ?? 0 },
                { label: "بقاء أفضل", value: localUser.stats.survivalBest },
                { label: "الستريك", value: streak },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-2 text-center card-hover">
                  <p className="text-lg font-black text-primary">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Bottom links */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              <button onClick={() => navigate("/stats")} className="text-xs text-secondary hover:text-secondary/80 transition-colors">
                📊 إحصائياتي
              </button>
              <span className="text-border">|</span>
              <button onClick={() => navigate("/leaderboard")} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                🏆 المتصدرون
              </button>
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

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {["⏱️ 30 ثانية", "🃏 بطاقات القوة", "📲 واتساب", "🔥 ستريك يومي", "🎁 مكافأة يومية"].map((f) => (
            <span key={f} className="bg-card border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">{f}</span>
          ))}
        </div>
      </div>

      <footer className="py-3 text-center text-xs text-muted-foreground border-t border-border/30">
        <span className="text-primary">ميدان</span> — {isGuest ? "الوضع الضيف (ميزات محدودة)" : "النسخة المجانية: 5 تحديات يومياً"}
      </footer>
    </div>
  );
}
