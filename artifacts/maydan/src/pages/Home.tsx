import { lazy, Suspense, useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  getOrCreateUser, updateDisplayName, canCreateChallenge,
  getActiveNotifications, AppNotification, updateStreak,
} from "@/lib/storage";
import { useAuth } from "@/lib/AuthContext";
import { syncStreak, getMyPendingChallengesCount, getMyPendingChallenges, deleteDbChallenge, type DbChallenge } from "@/lib/db";
import { Button } from "@/components/ui/button";
import StreakMilestone from "@/components/StreakMilestone";
import NotificationBanner from "@/components/NotificationBanner";
import { refreshLoginStreak, type LoginInfo } from "@/lib/engagement";
import { checkSeasonReset, getLevelInfo } from "@/lib/gamification";
import { getCountryFlag } from "@/lib/countryUtils";

const STREAK_POPUP_KEY = "maydan_streak_popup_v1";
const APP_BASE_URL = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const EngagementSection = lazy(() => import("@/components/EngagementSection"));
const LoginStreakPopup = lazy(() => import("@/components/LoginStreakPopup"));

function scheduleAfterPaint(callback: () => void): () => void {
  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (!cancelled) callback();
  }, 250);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
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
  const [seasonRewardMsg, setSeasonRewardMsg] = useState<string | null>(null);
  const [pendingChallenges, setPendingChallenges] = useState(0);
  const [showPendingSheet, setShowPendingSheet] = useState(false);
  const [pendingList, setPendingList] = useState<DbChallenge[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null);
  const [engagementReady, setEngagementReady] = useState(false);

  async function openPendingSheet() {
    setShowPendingSheet(true);
    setLoadingPending(true);
    if (dbUser?.id) {
      const rows = await getMyPendingChallenges(dbUser.id);
      setPendingList(rows);
      setPendingChallenges(rows.length);
    }
    setLoadingPending(false);
  }

  function resendChallenge(c: DbChallenge) {
    const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL}challenge/${c.id}`;
    const text =
      "⚔️ لا تزال تحدياتي بانتظارك!\n" +
      "هل تقبل التحدي؟ 😏\n" +
      `👉 ${baseUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function confirmDeleteChallenge(c: DbChallenge) {
    if (!dbUser?.id) return;
    if (!window.confirm("هل تريد حذف هذا التحدي؟")) return;
    setDeletingId(c.id);
    const ok = await deleteDbChallenge(c.id, dbUser.id);
    setDeletingId(null);
    if (ok) {
      setPendingList(prev => prev.filter(x => x.id !== c.id));
      setPendingChallenges(n => Math.max(0, n - 1));
    } else {
      alert("تعذر حذف التحدي. حاول مرة أخرى.");
    }
  }

  function handleChallengeClick() {
    if (pendingChallenges > 0) {
      void openPendingSheet();
    } else if (canCreate) {
      navigate("/create");
    }
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
      setNotifications(getActiveNotifications());
      return;
    }
    setNotifications(getActiveNotifications());
    if (!dbUser?.id || isGuest) {
      setPendingChallenges(0);
      setEngagementReady(false);
      return;
    }

    setStreak(dbUser.streak_count ?? 0);
    setEngagementReady(false);
    return scheduleAfterPaint(() => {
      setEngagementReady(true);
      void Promise.allSettled([
        syncStreak(dbUser.id),
        checkSeasonReset(
          dbUser.id,
          dbUser.achievements,
          dbUser.season_points ?? 0,
          dbUser.coins ?? 0,
        ),
        refreshLoginStreak(dbUser.id),
        getMyPendingChallengesCount(dbUser.id),
      ]).then(async ([streakResult, seasonResult, loginResult, pendingResult]) => {
        let profileChanged = false;
        if (streakResult.status === "fulfilled" && streakResult.value) {
          setStreak(streakResult.value.streak_count);
          const ms = streakResult.value.streak_count;
          if ([3, 7, 30].includes(ms) && !wasStreakShownToday(ms)) {
            setMilestone(ms);
            markStreakShown(ms);
          }
          profileChanged = true;
        }
        if (seasonResult.status === "fulfilled" && seasonResult.value) {
          setSeasonRewardMsg(`🏆 الموسم انتهى! حصلت على ${seasonResult.value.coinsAwarded} قرش (${seasonResult.value.tierName})`);
          setTimeout(() => setSeasonRewardMsg(null), 5000);
          profileChanged = true;
        }
        if (loginResult.status === "fulfilled" && loginResult.value) {
          if (loginResult.value.canClaim) setLoginInfo(loginResult.value);
          profileChanged = true;
        }
        if (pendingResult.status === "fulfilled") setPendingChallenges(pendingResult.value);
        if (profileChanged) await refreshUser();
      });
    });
  }, [dbUser?.id, isGuest]);

  function handleGuestSaveName() {
    if (!guestName.trim()) return;
    updateDisplayName(guestName.trim());
    setHasGuestName(true);
    const hit = updateStreak();
    if (hit) setMilestone(hit);
    setNotifications(getActiveNotifications());
  }

  const showContent = !!displayName;

  const modes = [
    {
      id: "challenge", icon: "⚔️", label: "تحدي", sub: "صديق أو عشوائي",
      gradient: "linear-gradient(135deg, #f97316, #dc2626)",
      onClick: () => (pendingChallenges > 0 || canCreate) ? handleChallengeClick() : undefined,
      disabled: pendingChallenges === 0 && !canCreate,
      badge: pendingChallenges > 0 ? pendingChallenges : undefined,
    },
    {
      id: "party", icon: "📺", label: "تجمعات", sub: "العب مع الجماعة",
      gradient: "linear-gradient(135deg, #7c3aed, #1d4ed8)",
      onClick: () => navigate("/party"),
    },
    {
      id: "daily", icon: "📅", label: "تحدي اليوم", sub: "5 أسئلة يومية",
      gradient: "linear-gradient(135deg, #d97706, #b45309)",
      onClick: () => navigate("/daily"),
    },
    {
      id: "ranked", icon: "🏆", label: "المتصدرون", sub: "تنافس أونلاين",
      gradient: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
      onClick: () => navigate("/ranked"),
    },
    {
      id: "training", icon: "🎓", label: "تدريب", sub: "تعلّم بلا ضغط",
      gradient: "linear-gradient(135deg, #0891b2, #155e75)",
      onClick: () => navigate("/training"),
    },
  ];

  const lvl = getLevelInfo(dbUser?.xp ?? 0);
  const xpCurrent = dbUser?.xp ?? 0;

  const hour = new Date().getHours();
  const greeting =
    hour < 5  ? { text: "ليلة هادئة 🌙", sub: "وقت مثالي لتحدي خاطف" } :
    hour < 17 ? { text: "مرحبا بك مجدداً 👋", sub: "هل تتحدى أحدهم الآن؟" } :
    hour < 21 ? { text: "مساء التحدي 🌅", sub: "وقت ذروة التحدي!" } :
                { text: "سهرة معرفية 🌌", sub: "آخر فرصة للستريك اليوم" };

  return (
    <div className="min-h-screen gradient-hero star-bg particle-bg flex flex-col relative">
      {milestone && <StreakMilestone days={milestone} onClose={() => setMilestone(null)} />}
      {loginInfo && dbUser && (
        <Suspense fallback={null}>
          <LoginStreakPopup
            userId={dbUser.id}
            info={loginInfo}
            onClose={() => setLoginInfo(null)}
            onClaimed={() => refreshUser()}
          />
        </Suspense>
      )}
      {seasonRewardMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 font-bold text-sm text-white shadow-xl bg-yellow-600 border border-yellow-500/50">
          {seasonRewardMsg}
        </div>
      )}

      {/* ── Compact Header ─────────────────────────────────────────────── */}
      <header className="px-4 pt-4 pb-3 flex justify-between items-center z-10 relative bg-background/50 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center gap-2">
          <img src={`${APP_BASE_URL}logo.png`} alt="ميدان" className="w-8 h-8 object-contain" />
          <span className="text-xl font-black text-primary tracking-tight">ميدان</span>
        </div>
        <div className="flex items-center gap-2">
          {!isGuest && dbUser && (dbUser.coins ?? 0) > 0 && (
            <div className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/30 rounded-full px-2.5 py-1">
              <span className="text-xs">🪙</span>
              <span className="text-xs font-bold text-yellow-400">{(dbUser.coins ?? 0).toLocaleString()}</span>
            </div>
          )}
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 rounded-full px-2.5 py-1">
              <span className="text-xs">🔥</span>
              <span className="text-xs font-bold text-orange-400">{streak}</span>
            </div>
          )}
          <button onClick={() => navigate("/settings")}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
            title="الإعدادات"
          >
            <span className="text-sm">⚙️</span>
          </button>
          {!isGuest && dbUser?.avatar_url ? (
            <img src={dbUser.avatar_url} alt={displayName}
              className="w-8 h-8 rounded-full border border-primary/50 object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate("/profile")} />
          ) : showContent && (
            <button onClick={() => navigate("/profile")}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
              title="الملف الشخصي"
            >👤</button>
          )}
        </div>
      </header>

      {/* ── Main body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-24">
        {showContent && notifications.length > 0 && (
          <NotificationBanner notifications={notifications} />
        )}

        <div className="rp-narrow px-4 pt-4 space-y-4">
          
          {/* Guest Name Prompt */}
          {isGuest && !hasGuestName && (
            <div className="bg-card/60 backdrop-blur-md rounded-[20px] p-4 border border-white/10 space-y-3 fade-in-up shadow-xl">
              <p className="text-sm font-bold text-center text-white/90">أدخل اسمك للبدء في التحدي:</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 h-12 bg-black/30 border border-white/10 rounded-xl px-3 text-right text-white placeholder:text-white/40 outline-none text-sm focus:border-primary/50 transition-colors"
                  placeholder="اسمك هنا..."
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGuestSaveName()}
                  maxLength={20}
                />
                <Button onClick={handleGuestSaveName} disabled={!guestName.trim()} className="h-12 px-6 gradient-gold text-black font-black hover:opacity-90 shrink-0 text-base rounded-xl">ابدأ</Button>
              </div>
              <div className="text-center pt-1">
                <button onClick={signOut} className="text-[11px] text-white/50 hover:text-white transition-colors underline">
                  سجّل الدخول لحفظ تقدمك
                </button>
              </div>
            </div>
          )}

          {/* Hero / Status Card */}
          {showContent && (
            <div className="glass-card p-3.5 flex items-center gap-3.5 relative overflow-hidden shadow-xl press-shrink" onClick={() => !isGuest && navigate("/profile")}>
              <div className="absolute -right-4 -top-4 w-28 h-28 bg-primary/20 blur-2xl rounded-full pointer-events-none" />
              <div className="relative shrink-0">
                {dbUser?.avatar_url ? (
                  <img src={dbUser.avatar_url} alt={displayName} className="w-14 h-14 rounded-[14px] border-2 border-primary/40 object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-[14px] border-2 border-primary/40 bg-black/30 flex items-center justify-center text-2xl">
                    {dbUser?.country ? getCountryFlag(dbUser.country) : "👤"}
                  </div>
                )}
                {isPremium && <span className="absolute -bottom-1.5 -right-1.5 text-sm drop-shadow-md">👑</span>}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-[15px] font-black truncate text-white leading-none">{googleDisplayName || displayName}</h2>
                  {isGuest && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 leading-none">ضيف</span>}
                </div>
                
                {/* XP Progress */}
                {!isGuest && (
                  <div className="mt-1">
                    <div className="flex justify-between items-center text-[9px] mb-1.5">
                      <span className="text-white/80 font-bold">المستوى {lvl.current.level}</span>
                      {lvl.next ? (
                        <span className="text-white/50 font-medium">{xpCurrent} / {lvl.next.xp} XP</span>
                      ) : (
                        <span className="text-yellow-400 font-bold">الحد الأقصى 🌟</span>
                      )}
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${lvl.progress * 100}%`, background: "linear-gradient(90deg,#d97706,#f59e0b)" }} />
                    </div>
                  </div>
                )}
              </div>
              
              {!isGuest && (
                <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-[14px] bg-black/30 border border-white/5">
                  <span className="text-xl leading-none drop-shadow-md">{lvl.current.icon}</span>
                </div>
              )}
            </div>
          )}

          {/* Play Now CTA (Survival) */}
          {showContent && (
            <button
              onClick={() => navigate("/survival")}
              className="w-full relative overflow-hidden rounded-[20px] p-4 text-center press-shrink transition-all shadow-2xl"
              style={{
                background: "linear-gradient(135deg, #dc2626, #7f1d1d)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <div className="shine"></div>
              <div className="flex items-center justify-center gap-3 relative z-10">
                <span className="text-3xl drop-shadow-md">🏃</span>
                <div className="flex flex-col items-start">
                  <span className="text-xl font-black text-white leading-tight">العب الآن ⚡</span>
                  <span className="text-[10px] text-white/80 font-bold">وضع البقاء - كم تصمد؟</span>
                </div>
              </div>
            </button>
          )}

          {/* Mode Grid (5 cards) */}
          {showContent && (
            <div className="grid grid-cols-2 gap-3">
              {modes.slice(0, 4).map(mode => (
                <button
                  key={mode.id}
                  onClick={mode.onClick}
                  disabled={mode.disabled}
                  className={`relative rounded-[16px] p-3 text-right press-shrink transition-all ${mode.disabled ? "opacity-50 grayscale cursor-not-allowed" : "hover:-translate-y-0.5 shadow-lg"}`}
                  style={{
                    background: mode.gradient,
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {mode.badge && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-md ring-2 ring-background z-10">
                      {mode.badge > 99 ? "99+" : mode.badge}
                    </span>
                  )}
                  <span className="text-2xl mb-1.5 block drop-shadow-sm">{mode.icon}</span>
                  <h3 className="text-sm font-black text-white leading-tight">{mode.label}</h3>
                  <p className="text-[9px] text-white/70 font-bold mt-0.5">{mode.sub}</p>
                </button>
              ))}
              
              {/* 5th element spans both columns */}
              <button
                onClick={modes[4].onClick}
                className="col-span-2 relative rounded-[16px] p-3.5 text-right flex items-center gap-3.5 press-shrink transition-all hover:-translate-y-0.5 shadow-lg"
                style={{
                  background: modes[4].gradient,
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <span className="text-3xl drop-shadow-sm shrink-0">{modes[4].icon}</span>
                <div className="flex-1">
                  <h3 className="text-[15px] font-black text-white leading-tight">{modes[4].label}</h3>
                  <p className="text-[10px] text-white/70 font-bold mt-0.5">{modes[4].sub}</p>
                </div>
              </button>
            </div>
          )}

          {/* Engagement */}
          {showContent && !isGuest && dbUser && engagementReady && (
            <Suspense fallback={<div className="h-14 rounded-[20px] border border-white/10 bg-card/30 animate-pulse" />}>
              <EngagementSection onCoins={() => refreshUser()} />
            </Suspense>
          )}

          {/* Greeting Line */}
          {showContent && (
            <div className="text-center mt-6 mb-4">
              <p className="text-[11px] font-black text-white/70">{greeting.text}</p>
              <p className="text-[9px] text-white/40 mt-0.5 font-bold">{greeting.sub}</p>
            </div>
          )}

        </div>
      </div>

      {/* ── Pending Challenges Sheet ─────────────────────────────────────── */}
      {showPendingSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end fade-in-up bg-background/80 backdrop-blur-sm" dir="rtl">
          <div className="absolute inset-0" onClick={() => setShowPendingSheet(false)} />
          <div className="bg-card border-t border-white/10 rounded-t-[32px] p-5 shadow-2xl relative z-10 max-h-[85vh] flex flex-col">
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-white">تحديات بانتظارك ⚔️</h2>
              <button onClick={() => setShowPendingSheet(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white/50 hover:text-white transition-colors">✕</button>
            </div>
            
            {loadingPending ? (
              <div className="py-10 flex justify-center"><div className="w-8 h-8 border-4 border-primary/40 border-t-primary rounded-full animate-spin" /></div>
            ) : pendingList.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-4xl mb-3">👻</p>
                <p className="text-white/60 text-sm font-bold">لا توجد تحديات معلقة!</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                {pendingList.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-black/20 border border-white/5 rounded-2xl">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-xl shrink-0 border border-orange-500/30">⚔️</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-white truncate">{c.opponent_name || "لاعب مجهول"}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" onClick={() => resendChallenge(c)} className="h-7 px-3 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white rounded-lg">تذكير 📱</Button>
                      <Button size="sm" variant="destructive" onClick={() => confirmDeleteChallenge(c)} disabled={deletingId === c.id} className="h-7 px-3 text-[10px] font-bold rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400">
                        {deletingId === c.id ? "..." : "حذف 🗑️"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-white/5">
              <Button
                onClick={() => { setShowPendingSheet(false); navigate("/create"); }}
                className="w-full font-black gradient-gold text-black h-12 rounded-xl text-sm"
                disabled={!canCreate}
              >
                {canCreate ? "إنشاء تحدي جديد ⚔️" : "وصلت للحد اليومي ⛔"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}