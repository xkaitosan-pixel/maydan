import CircularTimer from "@/components/CircularTimer";

interface GameHeaderProps {
  category: { icon: string; name: string; gradientFrom: string; gradientTo: string } | null;
  currentIndex: number;
  totalQuestions: number;
  timeLeft: number;
  totalTime: number;
  onExitClick: () => void;
}

export function GameHeader({
  category,
  currentIndex,
  totalQuestions,
  timeLeft,
  totalTime,
  onExitClick,
}: GameHeaderProps) {
  return (
    <header className="p-4 border-b border-border/30 bg-background/50 backdrop-blur-md sticky top-0 z-10">
      <div className="flex justify-between items-center mb-3">
        <button
          onClick={onExitClick}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors press-shrink"
          aria-label="خروج"
        >
          ✕
        </button>
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-card border border-border/50 shadow-sm">
          <span className="text-xl">{category?.icon}</span>
          <span className="text-sm font-bold">{category?.name}</span>
        </div>
        <CircularTimer timeLeft={timeLeft} totalTime={totalTime} size={48} strokeWidth={4} />
      </div>
      
      <div className="flex gap-1.5 justify-center max-w-xs mx-auto">
        {Array.from({ length: totalQuestions }).map((_, idx) => {
          const isActive = idx === currentIndex;
          const isPast = idx < currentIndex;
          const color = isPast 
            ? category?.gradientFrom || "hsl(45 85% 50%)" 
            : isActive 
            ? category?.gradientTo || "hsl(270 60% 50%)" 
            : "hsl(var(--muted))";
            
          return (
            <div
              key={idx}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                flex: isActive ? 3 : 1,
                backgroundColor: color,
                opacity: isActive || isPast ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-2 font-medium">
        السؤال {currentIndex + 1} من {totalQuestions}
      </p>
    </header>
  );
}
