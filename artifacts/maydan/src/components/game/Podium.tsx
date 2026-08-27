import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PodiumPlayer {
  id?: string;
  name: string;
  avatarUrl?: string | null;
  score: number;
  total: number;
  isWinner: boolean;
}

interface PodiumProps {
  player1: PodiumPlayer;
  player2: PodiumPlayer;
  gradientFrom?: string;
  gradientTo?: string;
  isTie?: boolean;
}

export function Podium({ player1, player2, gradientFrom = "#d97706", gradientTo = "#8b5cf6", isTie }: PodiumProps) {
  
  // Arrange so winner is always higher. If tie, equal height.
  // In RTL, player1 on right, player2 on left.
  const p1Height = player1.isWinner || isTie ? 160 : 120;
  const p2Height = player2.isWinner || isTie ? 160 : 120;
  
  const pct1 = Math.round((player1.score / player1.total) * 100);
  const pct2 = Math.round((player2.score / player2.total) * 100);

  return (
    <div className="relative pt-12 pb-6 px-4 flex justify-center items-end gap-2 sm:gap-4 h-64 mt-4">
      {/* Player 2 (Left) */}
      <div className="flex flex-col items-center w-1/2 max-w-[140px] relative z-10 fade-in-up" style={{ animationDelay: "0.2s" }}>
        {player2.isWinner && !isTie && (
          <span className="absolute -top-12 text-4xl drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] animate-bounce z-20">👑</span>
        )}
        <div className="relative mb-3">
          <Avatar className="w-16 h-16 border-4 shadow-lg" style={{ borderColor: player2.isWinner || isTie ? gradientFrom : "hsl(var(--border))" }}>
            <AvatarImage src={player2.avatarUrl || ""} />
            <AvatarFallback className="bg-muted text-foreground font-black text-xl">{player2.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-background border rounded-full px-2 py-0.5 text-xs font-black shadow-sm" style={{ color: player2.isWinner || isTie ? gradientFrom : "hsl(var(--muted-foreground))", borderColor: player2.isWinner || isTie ? gradientFrom : "hsl(var(--border))" }}>
            {pct2}%
          </div>
        </div>
        <p className="font-bold text-sm text-foreground truncate w-full text-center mb-1">{player2.name}</p>
        
        <div 
          className="w-full rounded-t-2xl flex flex-col items-center justify-start pt-4 transition-all duration-700 ease-out podium-2"
          style={{ 
            height: p2Height,
            background: player2.isWinner || isTie ? `linear-gradient(180deg, ${gradientFrom}44, transparent)` : `linear-gradient(180deg, hsl(var(--muted)), transparent)`,
            borderTop: `2px solid ${player2.isWinner || isTie ? gradientFrom : "hsl(var(--border))"}`
          }}
        >
          <span className="text-2xl font-black text-foreground">{player2.score}</span>
          <span className="text-[10px] text-muted-foreground">نقاط</span>
        </div>
      </div>

      {/* VS Badge */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-12 z-30 bg-background/80 backdrop-blur-sm rounded-full p-2 border border-border shadow-xl">
        <span className="text-xs font-black italic bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">VS</span>
      </div>

      {/* Player 1 (Right) */}
      <div className="flex flex-col items-center w-1/2 max-w-[140px] relative z-20 fade-in-up">
        {player1.isWinner && !isTie && (
          <span className="absolute -top-12 text-4xl drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] animate-bounce z-20">👑</span>
        )}
        <div className="relative mb-3">
          <Avatar className="w-16 h-16 border-4 shadow-lg" style={{ borderColor: player1.isWinner || isTie ? gradientFrom : "hsl(var(--border))" }}>
            <AvatarImage src={player1.avatarUrl || ""} />
            <AvatarFallback className="bg-primary/20 text-primary font-black text-xl">{player1.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-background border rounded-full px-2 py-0.5 text-xs font-black shadow-sm" style={{ color: player1.isWinner || isTie ? gradientFrom : "hsl(var(--muted-foreground))", borderColor: player1.isWinner || isTie ? gradientFrom : "hsl(var(--border))" }}>
            {pct1}%
          </div>
        </div>
        <p className="font-bold text-sm text-foreground truncate w-full text-center mb-1">{player1.name}</p>
        
        <div 
          className="w-full rounded-t-2xl flex flex-col items-center justify-start pt-4 transition-all duration-700 ease-out podium-1"
          style={{ 
            height: p1Height,
            background: player1.isWinner || isTie ? `linear-gradient(180deg, ${gradientFrom}66, transparent)` : `linear-gradient(180deg, hsl(var(--muted)), transparent)`,
            borderTop: `2px solid ${player1.isWinner || isTie ? gradientFrom : "hsl(var(--border))"}`
          }}
        >
          <span className="text-2xl font-black text-foreground">{player1.score}</span>
          <span className="text-[10px] text-muted-foreground">نقاط</span>
        </div>
      </div>
    </div>
  );
}
