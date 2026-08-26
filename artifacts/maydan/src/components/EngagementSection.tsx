import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  engagementFrom,
  getMissionViews,
  getWeeklyView,
  claimMission,
  claimWeekly,
  type EngagementState,
  type MissionView,
} from "@/lib/engagement";
import { playSound } from "@/lib/sound";
const RewardBox = lazy(() => import("./RewardBox"));

interface EngagementSectionProps {
  onCoins?: (newCoins: number) => void;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export default function EngagementSection({ onCoins }: EngagementSectionProps) {
  const { dbUser, isGuest, refreshUser } = useAuth();
  const [state, setState] = useState<EngagementState | null>(null);
  const [showBox, setShowBox] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const sync = useCallback(() => {
    if (dbUser) setState(engagementFrom(dbUser.achievements));
  }, [dbUser]);

  useEffect(() => { sync(); }, [sync]);

  if (isGuest || !dbUser || !state) return null;

  const userId = dbUser.id;
  const missions = getMissionViews(state);
  const weekly = getWeeklyView(state);
  const boxesPending = state.box.pending;
  const boxProgress = state.box.gamesSince;

  const completedTasks = missions.filter(m => m.complete || m.claimed).length + (weekly.complete || weekly.claimed ? 1 : 0);
  const totalTasks = missions.length + 1;

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
    <div className="rounded-[20px] border border-white/10 bg-card/40 backdrop-blur-md overflow-hidden" dir="rtl">
      {/* Header */}
      <button 
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl drop-shadow-sm">📋</span>
          <h3 className="text-sm font-black text-white">مهامك اليومية</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70 ml-2">
            {completedTasks}/{totalTasks}
          </span>
          {boxesPending > 0 && !expanded && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]">
              🎁
            </span>
          )}
        </div>
        <div className={`w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-white/50 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </button>

      {/* Collapsed Content */}
      <div 
        className={`grid transition-all duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="p-4 pt-0 space-y-4 border-t border-white/5 mt-1">
            
            {/* Daily missions */}
            <div className="space-y-2.5">
              {missions.map(m => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center text-base shrink-0 border border-white/5">
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="truncate text-xs font-bold text-white/90">{m.label}</span>
                      <span className="text-[10px] text-white/50">{m.current}/{m.target}</span>
                    </div>
                    <ProgressBar pct={(m.current / m.target) * 100} color="linear-gradient(90deg,#7c3aed,#a855f7)" />
                  </div>
                  {m.claimed ? (
                    <span className="text-[11px] font-bold text-green-400 w-[72px] text-center">✅ اكتملت</span>
                  ) : m.complete ? (
                    <button
                      onClick={() => handleClaimMission(m)}
                      disabled={claiming === m.id}
                      className="shrink-0 w-[72px] rounded-lg py-1.5 text-[10px] font-black text-black disabled:opacity-60 press-shrink"
                      style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)", boxShadow: "0 2px 8px rgba(217,119,6,0.3)" }}
                    >
                      استلم +{m.reward}
                    </button>
                  ) : (
                    <span className="shrink-0 w-[72px] text-center text-[10px] font-bold text-yellow-500/70">+{m.reward} 🪙</span>
                  )}
                </div>
              ))}
            </div>

            <div className="h-px bg-white/5 my-2 w-full rounded-full"></div>

            {/* Weekly + Reward Box Row */}
            <div className="flex gap-3">
              {/* Weekly */}
              <div className="flex-1 flex flex-col justify-center bg-black/20 border border-white/5 rounded-xl p-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 blur-xl rounded-full" />
                <div className="flex items-center justify-between mb-2 relative">
                  <span className="text-xs font-black text-white">تحدي الأسبوع 🎯</span>
                  <span className="text-[10px] font-bold text-white/50">{weekly.current}/{weekly.target}</span>
                </div>
                <div className="relative">
                  <ProgressBar pct={(weekly.current / weekly.target) * 100} color="linear-gradient(90deg,#0891b2,#06b6d4)" />
                </div>
                <div className="mt-2.5 text-center relative">
                  {weekly.claimed ? (
                    <span className="text-[11px] font-bold text-green-400">✅ تم الاستلام</span>
                  ) : weekly.complete ? (
                    <button
                      onClick={handleClaimWeekly}
                      disabled={claiming === "weekly"}
                      className="w-full rounded-lg py-1.5 text-[11px] font-black text-black disabled:opacity-60 press-shrink"
                      style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)", boxShadow: "0 2px 8px rgba(217,119,6,0.3)" }}
                    >
                      استلم المكافأة
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-white/60">الجائزة: {weekly.reward} 🪙 + وسام</span>
                  )}
                </div>
              </div>

              {/* Reward Box */}
              <div className="w-[100px] shrink-0 flex flex-col items-center justify-center bg-black/20 border border-white/5 rounded-xl p-3 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-purple-500/10 blur-xl rounded-full" />
                <span className="text-2xl mb-1 relative drop-shadow-md">🎁</span>
                {boxesPending > 0 ? (
                  <button
                    onClick={() => setShowBox(true)}
                    className="w-full animate-pulse rounded-lg py-1.5 px-1 text-[11px] font-black text-white mt-1 relative"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: "0 2px 8px rgba(168,85,247,0.4)" }}
                  >
                    افتح ({boxesPending})
                  </button>
                ) : (
                  <div className="w-full relative mt-0.5">
                    <span className="block text-[10px] font-bold text-white/50 mb-1.5">{boxProgress}/5 ألعاب</span>
                    <ProgressBar pct={(boxProgress / 5) * 100} color="linear-gradient(90deg,#7c3aed,#a855f7)" />
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {showBox && (
        <Suspense fallback={null}>
          <RewardBox
            userId={userId}
            onClose={() => { setShowBox(false); sync(); }}
            onOpened={async (r) => {
              if (r.kind === "coins") onCoins?.((dbUser.coins ?? 0) + r.amount);
              await refreshUser();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}