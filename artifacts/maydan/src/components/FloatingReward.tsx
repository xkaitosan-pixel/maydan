import { useEffect, useState } from "react";

interface FloatingRewardProps {
  xp?: number;
  coins?: number;
  onDone?: () => void;
}

export default function FloatingReward({ xp, coins, onDone }: FloatingRewardProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDone?.(), 400);
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-1 pointer-events-none transition-all duration-400"
      style={{ opacity: visible ? 1 : 0, transform: `translateX(-50%) translateY(${visible ? 0 : -20}px)` }}
    >
      {xp !== undefined && xp > 0 && (
        <div
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black text-white border border-purple-500/40"
          style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)", boxShadow: "0 4px 20px rgba(124,58,237,0.5)" }}
        >
          <span>⭐</span>
          <span>+{xp} XP</span>
        </div>
      )}
      {coins !== undefined && coins > 0 && (
        <div
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black border border-yellow-500/40"
          style={{ background: "linear-gradient(135deg,#d97706,#92400e)", color: "#fff", boxShadow: "0 4px 20px rgba(217,119,6,0.5)" }}
        >
          <span>🪙</span>
          <span>+{coins} قرش</span>
        </div>
      )}
    </div>
  );
}
