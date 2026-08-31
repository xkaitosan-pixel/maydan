import { useLocation } from "wouter";
import { canCreateChallenge } from "@/lib/storage";

interface ModeChooserProps {
  categoryId: string;
  onBack: () => void;
  pendingChallenges: number;
  onChallenge: () => void;
}

export default function ModeChooser({ categoryId, onBack, pendingChallenges, onChallenge }: ModeChooserProps) {
  const [, navigate] = useLocation();
  const canCreate = canCreateChallenge();

  const modes = [
    {
      id: "challenge", icon: "⚔️", label: "تحدي", sub: "صديق أو عشوائي",
      gradient: "linear-gradient(135deg, #f97316, #dc2626)",
      onClick: onChallenge,
    },
    {
      id: "party", icon: "📺", label: "تجمعات", sub: "العب مع الجماعة",
      gradient: "linear-gradient(135deg, #7c3aed, #1d4ed8)",
      onClick: () => navigate(`/party?cat=${encodeURIComponent(categoryId)}`),
    },
    {
      id: "training", icon: "🎓", label: "تدريب", sub: "تعلّم بلا ضغط",
      gradient: "linear-gradient(135deg, #0891b2, #155e75)",
      onClick: () => navigate(`/training?cat=${encodeURIComponent(categoryId)}`),
    },
    {
      id: "survival", icon: "🏃", label: "بقاء", sub: "كم تصمد؟",
      gradient: "linear-gradient(135deg, #dc2626, #7f1d1d)",
      onClick: () => navigate(`/survival?cat=${encodeURIComponent(categoryId)}`),
    },
    {
      id: "ranked", icon: "🏆", label: "المتصدرون", sub: "تنافس أونلاين",
      gradient: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
      onClick: () => navigate(`/ranked?cat=${encodeURIComponent(categoryId)}`),
    }
  ];

  return (
    <div className="space-y-4 fade-in-up">
      <button onClick={onBack} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
        <span className="text-lg">←</span> عودة للفئات
      </button>

      <h2 className="text-xl font-black">اختر وضع اللعب</h2>

      <div className="grid grid-cols-2 gap-3">
        {modes.map(mode => (
          <button
            key={mode.id}
            onClick={mode.onClick}
            className="relative rounded-[16px] p-3 text-right press-shrink transition-all hover:-translate-y-0.5 shadow-lg"
            style={{
              background: mode.gradient,
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span className="text-3xl block mb-2">{mode.icon}</span>
            <h3 className="text-base font-black text-white leading-tight">{mode.label}</h3>
            <p className="text-[10px] text-white/70 font-bold mt-1">
              {mode.id === "challenge" && pendingChallenges > 0
                ? `${pendingChallenges} تحديات بانتظارك`
                : mode.sub}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
