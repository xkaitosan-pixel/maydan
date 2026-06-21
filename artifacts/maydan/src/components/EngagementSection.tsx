import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  engagementFrom,
  getMissionViews,
  getWeeklyView,
  getMotivationMessages,
  claimMission,
  claimWeekly,
  type EngagementState,
  type MissionView,
} from "@/lib/engagement";
import { getLevelInfo } from "@/lib/gamification";
import { playSound } from "@/lib/sound";
import RewardBox from "./RewardBox";

interface EngagementSectionProps {
  onCoins?: (newCoins: number) => void;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export default function EngagementSection({ onCoins }: EngagementSectionProps) {
  const { dbUser, isGuest, refreshUser } = useAuth();
  const [state, setState] = useState<EngagementState | null>(null);
  const [showBox, setShowBox] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const sync = useCallback(() => {
    if (dbUser) setState(engagementFrom(dbUser.achievements));
  }, [dbUser]);

  useEffect(() => { sync(); }, [sync]);

  // Guests have no engagement state.
  if (isGuest || !dbUser || !state) return null;

  const userId = dbUser.id;
  const missions = getMissionViews(state);
  const weekly = getWeeklyView(state);
  const boxesPending = state.box.pending;
  const boxProgress = state.box.gamesSince;

  const lvl = getLevelInfo(dbUser.xp ?? 0);
  const motivations = getMotivationMessages({
    state,
    level: lvl.current.level,
    xpIntoLevel: lvl.xpInLevel,
    xpForLevel: lvl.xpToNext,
    playStreak: dbUser.streak_count ?? 0,
  });

  async function handleClaimMission(m: MissionView) {
    if (claiming) return;
    setClaiming(m.id);
    const res = await claimMission(userId, m.id);
    if (res.ok) {
      try { playSound("coin"); } catch { /* noop */ }
      onCoins?.(res.newCoins);
      await refreshUser();
    }
    setClaiming(null);
  }

  async function handleClaimWeekly() {
    if (claiming) return;
    setClaiming("weekly");
    const res = await claimWeekly(userId);
    if (res.ok) {
      try { playSound("achievement"); } catch { /* noop */ }
      onCoins?.(res.newCoins);
      await refreshUser();
    }
    setClaiming(null);
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* Motivation messages */}
      {motivations.length > 0 && (
        <div className="space-y-1.5">
          {motivations.slice(0, 2).map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-foreground"
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Daily missions */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-foreground">🎯 المهام اليومية</h3>
          <span className="text-[10px] text-muted-foreground">تتجدد منتصف الليل</span>
        </div>
        <div className="space-y-2.5">
          {missions.map(m => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-lg">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <span className="truncate text-xs font-bold text-foreground">{m.label}</span>
                  <span className="text-[10px] text-muted-foreground">{m.current}/{m.target}</span>
                </div>
                <ProgressBar pct={(m.current / m.target) * 100} color="linear-gradient(90deg,#7c3aed,#a855f7)" />
              </div>
              {m.claimed ? (
                <span className="text-xs font-bold text-green-400">✅</span>
              ) : m.complete ? (
                <button
                  onClick={() => handleClaimMission(m)}
                  disabled={claiming === m.id}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-black text-background disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                >
                  استلم +{m.reward}
                </button>
              ) : (
                <span className="shrink-0 text-[10px] text-muted-foreground">+{m.reward}🪙</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly challenge + reward box row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Weekly challenge */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <h3 className="text-xs font-black text-foreground">تحدي الأسبوع</h3>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">أجب {weekly.target} سؤال صحيح</p>
          <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{weekly.current}/{weekly.target}</span>
            <span>الجائزة: {weekly.reward}🪙 + وسام</span>
          </div>
          <ProgressBar pct={(weekly.current / weekly.target) * 100} color="linear-gradient(90deg,#0891b2,#06b6d4)" />
          {weekly.claimed ? (
            <div className="mt-2.5 text-center text-[11px] font-bold text-green-400">✅ تم الاستلام</div>
          ) : weekly.complete ? (
            <button
              onClick={handleClaimWeekly}
              disabled={claiming === "weekly"}
              className="mt-2.5 w-full rounded-lg py-2 text-[11px] font-black text-background disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
            >
              استلم المكافأة
            </button>
          ) : null}
        </div>

        {/* Reward box */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg">🎁</span>
            <h3 className="text-xs font-black text-foreground">صندوق المكافآت</h3>
          </div>
          {boxesPending > 0 ? (
            <>
              <p className="mb-2 flex-1 text-[11px] text-green-400">
                لديك {boxesPending} صندوق جاهز للفتح!
              </p>
              <button
                onClick={() => setShowBox(true)}
                className="w-full animate-pulse rounded-lg py-2 text-[11px] font-black text-white"
                style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
              >
                افتح الصندوق 🎉
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">صندوق كل 5 ألعاب</p>
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{boxProgress}/5 ألعاب</span>
              </div>
              <ProgressBar pct={(boxProgress / 5) * 100} color="linear-gradient(90deg,#7c3aed,#a855f7)" />
            </>
          )}
        </div>
      </div>

      {showBox && (
        <RewardBox
          userId={userId}
          onClose={() => { setShowBox(false); sync(); }}
          onOpened={async (r) => {
            if (r.kind === "coins") onCoins?.((dbUser.coins ?? 0) + r.amount);
            await refreshUser();
          }}
        />
      )}
    </div>
  );
}
