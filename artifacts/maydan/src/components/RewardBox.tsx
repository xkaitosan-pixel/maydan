import { useEffect, useState } from "react";
import { openRewardBox, type BoxReward } from "@/lib/engagement";
import { playSound } from "@/lib/sound";

type Phase = "idle" | "shaking" | "revealed";

const RARITY_STYLE: Record<BoxReward["rarity"], { ring: string; glow: string; label: string }> = {
  common: { ring: "#94a3b8", glow: "rgba(148,163,184,0.5)", label: "عادي" },
  rare:   { ring: "#3b82f6", glow: "rgba(59,130,246,0.6)",  label: "نادر" },
  epic:   { ring: "#a855f7", glow: "rgba(168,85,247,0.7)",  label: "أسطوري" },
};

const CONFETTI_COLORS = ["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f43f5e", "#facc15"];

function Confetti() {
  const pieces = Array.from({ length: 36 });
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const dx = (Math.random() - 0.5) * 200;
        const dur = 1.8 + Math.random() * 1.6;
        const delay = Math.random() * 0.4;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              background: color,
              ["--dx" as string]: `${dx}px`,
              ["--dur" as string]: `${dur}s`,
              ["--delay" as string]: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}

interface RewardBoxProps {
  userId: string;
  onClose: () => void;
  /** Called after a successful open so the parent can refresh user/coins state. */
  onOpened?: (reward: BoxReward) => void;
}

export default function RewardBox({ userId, onClose, onOpened }: RewardBoxProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reward, setReward] = useState<BoxReward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleOpen() {
    if (busy || phase !== "idle") return;
    setBusy(true);
    setPhase("shaking");
    try { playSound("click"); } catch { /* noop */ }

    // Fire the DB call immediately; reveal after the shake animation finishes.
    const resultPromise = openRewardBox(userId);
    await new Promise(r => setTimeout(r, 900));
    const result = await resultPromise;

    if (!result.ok || !result.reward) {
      setError("لا يوجد صندوق متاح حالياً");
      setPhase("idle");
      setBusy(false);
      return;
    }
    setReward(result.reward);
    setPhase("revealed");
    try { playSound(result.reward.rarity === "epic" ? "achievement" : "coin"); } catch { /* noop */ }
    onOpened?.(result.reward);
    setBusy(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rarity = reward ? RARITY_STYLE[reward.rarity] : null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={() => { if (phase !== "shaking") onClose(); }}
      dir="rtl"
    >
      {phase === "revealed" && <Confetti />}

      <div
        className="relative z-[2] w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {phase !== "revealed" && (
          <>
            <h3 className="mb-1 text-xl font-black text-foreground">🎁 صندوق المكافآت</h3>
            <p className="mb-6 text-sm text-muted-foreground">لقد فتحت صندوقاً! اضغط لتكشف الجائزة.</p>
            <div
              className={`mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-3xl ${phase === "shaking" ? "box-shake" : ""}`}
              style={{
                fontSize: 72,
                background: "linear-gradient(160deg,#7c3aed,#4c1d95)",
                boxShadow: "0 10px 40px rgba(124,58,237,0.45)",
                border: "2px solid rgba(255,255,255,0.18)",
              }}
            >
              🎁
            </div>
            {error && <p className="mb-3 text-sm font-bold text-destructive">{error}</p>}
            <button
              onClick={handleOpen}
              disabled={busy}
              className="w-full rounded-2xl py-3.5 font-black text-background disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
            >
              {phase === "shaking" ? "جارٍ الفتح..." : "افتح الصندوق"}
            </button>
          </>
        )}

        {phase === "revealed" && reward && rarity && (
          <>
            <div
              className="box-burst mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full"
              style={{
                fontSize: 70,
                background: `radial-gradient(circle, ${rarity.glow}, transparent 70%)`,
                border: `3px solid ${rarity.ring}`,
                boxShadow: `0 0 40px ${rarity.glow}`,
              }}
            >
              {reward.icon}
            </div>
            <span
              className="mb-2 inline-block rounded-full px-3 py-1 text-xs font-black"
              style={{ background: rarity.glow, color: "#fff" }}
            >
              {rarity.label}
            </span>
            <h3 className="mb-1 text-2xl font-black text-foreground">{reward.label}</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {reward.kind === "frame" ? "تم تفعيل الإطار على ملفك!" : "أُضيفت إلى رصيدك"}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-2xl py-3.5 font-black text-white"
              style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)" }}
            >
              رائع!
            </button>
          </>
        )}
      </div>
    </div>
  );
}
