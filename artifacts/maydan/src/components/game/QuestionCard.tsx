import QuestionImage from "@/components/QuestionImage";
import ReportFlag from "@/components/ReportFlag";

interface QuestionCardProps {
  question: string;
  difficulty: "easy" | "medium" | "hard";
  imageUrl?: string | null;
  questionId: string;
  reporterName?: string | null;
  onReportOpenChange?: (open: boolean) => void;
  categoryGradientFrom?: string;
  categoryGradientTo?: string;
}

export function QuestionCard({
  question,
  difficulty,
  imageUrl,
  questionId,
  reporterName,
  onReportOpenChange,
  categoryGradientFrom = "hsl(45 85% 50%)",
  categoryGradientTo = "hsl(35 90% 60%)"
}: QuestionCardProps) {
  
  const diffLabel = difficulty === "easy" ? "سهل" : difficulty === "medium" ? "متوسط" : "صعب";
  const diffColor = difficulty === "easy" ? "#22c55e" : difficulty === "medium" ? "#eab308" : "#ef4444";

  return (
    <div className="relative z-0">
      <div className="text-center flex justify-center mb-[-12px] relative z-10">
        <span 
          className="text-xs px-4 py-1 rounded-full font-bold shadow-md"
          style={{ 
            background: `linear-gradient(135deg, ${categoryGradientFrom}, ${categoryGradientTo})`, 
            color: "#fff",
          }}
        >
          {diffLabel}
        </span>
      </div>

      <div 
        className="glass-card pt-8 pb-6 px-6 text-center slide-in relative bg-card/80 backdrop-blur-xl border-t-2" 
        style={{ 
          boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
          borderTopColor: categoryGradientFrom
        }}
      >
        <ReportFlag
          questionId={questionId}
          questionText={question}
          reporter={reporterName || null}
          onOpenChange={onReportOpenChange}
        />
        
        {imageUrl && (
          <div className="mb-4 mt-2">
            <QuestionImage url={imageUrl} maxHeight={180} className="rounded-xl overflow-hidden shadow-inner" />
          </div>
        )}
        
        <h2 className="text-xl md:text-2xl font-black leading-snug md:leading-relaxed text-foreground">
          {question}
        </h2>
      </div>
    </div>
  );
}
