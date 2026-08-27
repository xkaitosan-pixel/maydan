interface AnswerOptionsProps {
  options: string[];
  selectedOption: number | null;
  correctOption: number;
  showResult: boolean;
  onSelect: (index: number) => void;
  disabled: boolean;
}

export function AnswerOptions({
  options,
  selectedOption,
  correctOption,
  showResult,
  onSelect,
  disabled
}: AnswerOptionsProps) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {options.map((option, idx) => {
        const isCorrect = showResult && idx === correctOption;
        const isWrongSelected = showResult && idx === selectedOption && idx !== correctOption;
        const isSelectedPending = !showResult && idx === selectedOption;
        
        let style: React.CSSProperties = {
          background: "hsl(var(--card))",
          borderColor: "hsl(var(--border))",
          color: "hsl(var(--foreground))"
        };
        
        if (isCorrect) {
          style = { 
            background: "linear-gradient(135deg,#16a34a,#22c55e)", 
            borderColor: "#22c55e", 
            boxShadow: "0 0 22px rgba(34,197,94,0.35)", 
            color: "#fff" 
          };
        } else if (isWrongSelected) {
          style = { 
            background: "linear-gradient(135deg,#b91c1c,#ef4444)", 
            borderColor: "#ef4444", 
            boxShadow: "0 0 22px rgba(239,68,68,0.35)", 
            color: "#fff" 
          };
        } else if (isSelectedPending) {
          style = { 
            background: "linear-gradient(135deg, hsl(45 85% 50% / 0.15), hsl(45 85% 50% / 0.05))", 
            borderColor: "hsl(45 85% 50%)", 
            color: "hsl(var(--foreground))" 
          };
        } else if (showResult) {
          style = {
            opacity: 0.6,
            background: "hsl(var(--card))",
            borderColor: "hsl(var(--border))",
            color: "hsl(var(--foreground))"
          }
        }

        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            disabled={disabled}
            className={`press-shrink w-full text-right font-semibold text-base rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group ${
              !showResult && !isSelectedPending ? "hover:border-primary/50 hover:bg-muted/50" : ""
            } ${isCorrect ? "shake" : ""}`}
            style={{ ...style, minHeight: 64, padding: "12px 16px" }}
          >
            {isSelectedPending && (
              <div className="absolute inset-0 bg-primary/10 animate-pulse" />
            )}
            
            <span className="flex items-center gap-3 relative z-10">
              <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 transition-colors ${
                isCorrect || isWrongSelected ? "border-white/50 text-white bg-white/20" : 
                isSelectedPending ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground group-hover:text-foreground group-hover:border-foreground/30"
              }`}>
                {["أ","ب","ج","د"][idx]}
              </span>
              
              <span className="flex-1 leading-snug">{option}</span>
              
              {isCorrect && (
                <span className="text-xl bg-white/20 w-8 h-8 flex items-center justify-center rounded-full shrink-0 animate-in zoom-in">✓</span>
              )}
              {isWrongSelected && (
                <span className="text-xl bg-white/20 w-8 h-8 flex items-center justify-center rounded-full shrink-0 animate-in zoom-in">✗</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
