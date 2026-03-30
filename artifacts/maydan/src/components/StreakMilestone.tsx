interface Props {
  days: number;
  onClose: () => void;
}

const MILESTONE_DATA: Record<number, { title: string; subtitle: string; emoji: string; color: string }> = {
  3:  { title: "٣ أيام متتالية!", subtitle: "أنت في المسار الصحيح 💪", emoji: "🔥", color: "#f97316" },
  7:  { title: "أسبوع كامل! 🎉", subtitle: "لاعب مخلص! استمر يا بطل", emoji: "⚡", color: "#8b5cf6" },
  30: { title: "شهر متواصل! 👑", subtitle: "أسطورة ميدان! لا يوجد مثلك", emoji: "👑", color: "#eab308" },
};

export default function StreakMilestone({ days, onClose }: Props) {
  const data = MILESTONE_DATA[days];
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-3xl p-8 text-center fade-in-up shadow-2xl"
        style={{ background: `linear-gradient(135deg, ${data.color}22, ${data.color}44)`, border: `2px solid ${data.color}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated emoji */}
        <div className="text-7xl mb-4 animate-bounce">{data.emoji}</div>
        <div className="text-5xl font-black mb-3" style={{ color: data.color }}>
          🔥 {days}
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">{data.title}</h2>
        <p className="text-muted-foreground text-sm mb-6">{data.subtitle}</p>

        {/* Confetti dots */}
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ backgroundColor: data.color, animationDelay: `${i * 0.1}s`, opacity: 0.7 + (i % 3) * 0.1 }}
            />
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: data.color }}
        >
          رائع! استمر 🚀
        </button>
      </div>
    </div>
  );
}
