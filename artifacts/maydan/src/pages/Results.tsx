import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { questions } from "@/lib/questions";
import { getChallenge, recordWin } from "@/lib/storage";
import { Button } from "@/components/ui/button";

export default function Results() {
  const params = useParams<{ id: string; role: string }>();
  const [, navigate] = useLocation();
  const challengeId = params.id;
  const role = params.role as "creator" | "challenger";

  const challenge = getChallenge(challengeId);
  const [winRecorded, setWinRecorded] = useState(false);

  useEffect(() => {
    if (!challenge) return;
    
    if (challenge.status === 'completed' && !winRecorded) {
      const creatorScore = challenge.creatorScore;
      const challengerScore = challenge.challengerScore ?? 0;
      
      if (role === "creator" && creatorScore > challengerScore) {
        recordWin();
        setWinRecorded(true);
      } else if (role === "challenger" && challengerScore > creatorScore) {
        recordWin();
        setWinRecorded(true);
      }
    }
  }, [challenge, role]);

  if (!challenge) {
    navigate("/");
    return null;
  }

  const questionList = challenge.questions.map(id => questions.find(q => q.id === id)!);
  const totalQuestions = questionList.length;

  const creatorScore = challenge.creatorScore;
  const challengerScore = challenge.challengerScore;
  const isCompleted = challenge.status === 'completed';

  const myScore = role === "creator" ? creatorScore : (challengerScore ?? 0);
  const opponentScore = role === "creator" ? (challengerScore ?? null) : creatorScore;
  const opponentName = role === "creator" ? (challenge.challengerName ?? "المنتظر") : challenge.creatorName;
  const myName = role === "creator" ? challenge.creatorName : (challenge.challengerName ?? "أنت");

  // Who won?
  let winnerText = "";
  let isWinner = false;
  let isTie = false;
  
  if (isCompleted && opponentScore !== null) {
    if (myScore > opponentScore) {
      winnerText = "🎉 أنت الفائز!";
      isWinner = true;
    } else if (myScore < opponentScore) {
      winnerText = "😔 لقد خسرت هذه المرة";
      isWinner = false;
    } else {
      winnerText = "🤝 تعادل!";
      isTie = true;
    }
  }

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}challenge/${challengeId}`;
  
  function shareOnWhatsApp() {
    const text = role === "creator"
      ? `تحداني ${challenge!.creatorName} في اختبار معرفة وحصل على ${creatorScore}/${totalQuestions}!\nهل تستطيع التغلب عليه؟ جرب الآن:\n${shareUrl}`
      : `قبلت تحدي ${challenge!.creatorName} في ميدان!\nنتيجتي: ${myScore}/${totalQuestions} vs ${opponentScore}/${totalQuestions}\nجرب أنت أيضاً:\n${shareUrl}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
  }

  const percentage = Math.round((myScore / totalQuestions) * 100);

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
          ←
        </button>
        <h1 className="text-lg font-bold">نتائج التحدي</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Winner banner */}
        {isCompleted && (
          <div className={`rounded-2xl p-5 text-center fade-in-up border ${
            isWinner
              ? "gradient-gold border-primary/30"
              : isTie
              ? "bg-secondary/20 border-secondary/30"
              : "bg-card border-border"
          }`}>
            <p className={`text-2xl font-black ${isWinner ? "text-background" : "text-foreground"}`}>
              {winnerText}
            </p>
          </div>
        )}

        {/* Score comparison */}
        {isCompleted ? (
          <div className="bg-card border border-border rounded-2xl p-5 fade-in-up">
            <div className="grid grid-cols-3 gap-4 items-center text-center">
              {/* Me */}
              <div>
                <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl font-black text-primary">{myScore}</span>
                </div>
                <p className="text-xs text-muted-foreground">{myName}</p>
                <p className="text-xs text-primary">{percentage}%</p>
              </div>
              
              {/* VS */}
              <div>
                <p className="text-2xl font-black text-muted-foreground">VS</p>
              </div>
              
              {/* Opponent */}
              <div>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 border-2 ${
                  opponentScore! > myScore
                    ? "bg-primary/20 border-primary"
                    : "bg-muted border-border"
                }`}>
                  <span className={`text-xl font-black ${opponentScore! > myScore ? "text-primary" : "text-muted-foreground"}`}>
                    {opponentScore}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{opponentName}</p>
                <p className="text-xs text-muted-foreground">{Math.round(((opponentScore ?? 0) / totalQuestions) * 100)}%</p>
              </div>
            </div>
          </div>
        ) : (
          /* Waiting for challenger */
          <div className="bg-card border border-border rounded-2xl p-5 text-center fade-in-up space-y-4">
            <div className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center mx-auto gold-glow">
              <span className="text-3xl font-black text-background">{creatorScore}</span>
            </div>
            <div>
              <p className="font-bold text-lg">نتيجتك: {creatorScore}/{totalQuestions}</p>
              <p className="text-muted-foreground text-sm">شارك الرابط مع صديقك ليقبل التحدي!</p>
            </div>
            
            <div className="animate-pulse flex justify-center gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">في انتظار المنافس...</p>
          </div>
        )}

        {/* My score card */}
        <div className="bg-card border border-border rounded-2xl p-5 fade-in-up">
          <div className="flex justify-between items-center mb-3">
            <p className="font-bold">نتيجتك التفصيلية</p>
            <span className={`text-sm font-bold px-2 py-1 rounded-full ${
              percentage >= 70 ? "bg-green-500/20 text-green-400" :
              percentage >= 40 ? "bg-yellow-500/20 text-yellow-400" :
              "bg-red-500/20 text-red-400"
            }`}>
              {myScore}/{totalQuestions}
            </span>
          </div>
          
          {/* Circular progress */}
          <div className="flex justify-center mb-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full progress-ring" viewBox="0 0 36 36">
                <path className="stroke-muted fill-none stroke-[3]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path
                  className="fill-none stroke-[3] transition-all duration-1000"
                  strokeLinecap="round"
                  stroke="hsl(45 85% 50%)"
                  strokeDasharray={`${percentage}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black text-primary">{percentage}%</span>
              </div>
            </div>
          </div>

          {/* Question breakdown */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {questionList.map((q, idx) => {
              const myAnswer = role === "creator" ? challenge.creatorAnswers[idx] : (challenge.challengerAnswers?.[idx] ?? null);
              const isCorrect = myAnswer === q.correct;
              return (
                <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                  isCorrect ? "bg-green-500/10" : myAnswer === null ? "bg-yellow-500/10" : "bg-red-500/10"
                }`}>
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCorrect ? "bg-green-500 text-white" : myAnswer === null ? "bg-yellow-500 text-black" : "bg-red-500 text-white"
                  }`}>
                    {isCorrect ? "✓" : myAnswer === null ? "⏱" : "✗"}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-1 flex-1 text-right">{q.question}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 fade-in-up">
          {/* Share link */}
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-2">رابط التحدي:</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs bg-muted rounded-lg px-2 py-1 text-muted-foreground text-left"
              />
              <button
                onClick={copyLink}
                className="text-xs bg-secondary/20 border border-secondary/30 text-secondary px-3 py-1 rounded-lg hover:bg-secondary/30 transition-colors shrink-0"
              >
                نسخ
              </button>
            </div>
          </div>

          <Button
            onClick={shareOnWhatsApp}
            className="w-full h-12 font-bold rounded-xl text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: "#25D366" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            مشاركة عبر واتساب
          </Button>

          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="w-full h-12 rounded-xl border-border text-foreground hover:bg-card"
          >
            🏠 العودة للرئيسية
          </Button>

          <Button
            onClick={() => navigate("/create")}
            className="w-full h-12 rounded-xl gradient-purple text-white font-bold hover:opacity-90"
          >
            ⚔️ تحدي جديد
          </Button>
        </div>
      </div>
    </div>
  );
}
