import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface VersusIntroProps {
  player1Name: string;
  player1Avatar?: string | null;
  player2Name: string;
  player2Avatar?: string | null;
  categoryName: string;
  categoryIcon: string;
  gradientFrom: string;
  gradientTo: string;
  onComplete: () => void;
}

export function VersusIntro({
  player1Name,
  player1Avatar,
  player2Name,
  player2Avatar,
  categoryName,
  categoryIcon,
  gradientFrom,
  gradientTo,
  onComplete
}: VersusIntroProps) {
  const [phase, setPhase] = useState(0); // 0 = start, 1 = clash, 2 = zoom out

  useEffect(() => {
    // Timing logic for the animation
    const t1 = setTimeout(() => setPhase(1), 800); // 0.8s: characters slide in
    const t2 = setTimeout(() => setPhase(2), 2200); // 2.2s: hold then fade out
    const t3 = setTimeout(() => onComplete(), 2800); // 2.8s: done
    
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-background transition-opacity duration-500 ${
        phase === 2 ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Dynamic Background */}
      <div className="absolute inset-0 opacity-20 particle-bg" />
      <div 
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${gradientFrom}33 0%, transparent 70%)`
        }}
      />
      
      {/* Category Tag */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center animate-in fade-in slide-in-from-top-8 duration-700">
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-2xl mb-3"
          style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
        >
          {categoryIcon}
        </div>
        <h2 className="text-xl font-black tracking-wider text-foreground">{categoryName}</h2>
      </div>

      <div className="relative w-full max-w-md h-64 mt-10">
        {/* Player 1 (Right in RTL, conceptually left in DOM, but let's position explicitly) */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-700 ease-out"
          style={{
            right: phase >= 1 ? "15%" : "-50%",
            opacity: phase >= 1 ? 1 : 0
          }}
        >
          <div className="relative">
            <Avatar className="w-24 h-24 border-4 border-background shadow-2xl z-10 relative">
              <AvatarImage src={player1Avatar || ""} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">
                {player1Name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ backgroundColor: gradientFrom }} />
          </div>
          <span className="mt-4 font-black text-lg text-foreground bg-background/80 px-4 py-1 rounded-full backdrop-blur-sm border border-border">
            {player1Name}
          </span>
        </div>

        {/* VS badge */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-500 delay-500"
          style={{
            transform: `translate(-50%, -50%) scale(${phase >= 1 ? 1 : 0.5}) rotate(${phase >= 1 ? "0deg" : "-45deg"})`,
            opacity: phase >= 1 ? 1 : 0
          }}
        >
          <div className="w-16 h-16 rounded-full bg-background border-4 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)]" style={{ borderColor: gradientTo }}>
            <span className="text-2xl font-black italic" style={{ color: gradientTo }}>VS</span>
          </div>
        </div>

        {/* Player 2 (Left in RTL) */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-700 ease-out"
          style={{
            left: phase >= 1 ? "15%" : "-50%",
            opacity: phase >= 1 ? 1 : 0
          }}
        >
          <div className="relative">
            <Avatar className="w-24 h-24 border-4 border-background shadow-2xl z-10 relative">
              <AvatarImage src={player2Avatar || ""} />
              <AvatarFallback className="bg-secondary/20 text-secondary text-2xl font-black">
                {player2Name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ backgroundColor: gradientTo }} />
          </div>
          <span className="mt-4 font-black text-lg text-foreground bg-background/80 px-4 py-1 rounded-full backdrop-blur-sm border border-border">
            {player2Name}
          </span>
        </div>
      </div>
      
      <div className="absolute bottom-12 text-muted-foreground font-bold animate-pulse tracking-widest">
        استعد للمواجهة...
      </div>
    </div>
  );
}
