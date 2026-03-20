import { useState } from "react";
import { useLocation } from "wouter";
import { questions, getRandomQuestions } from "@/lib/questions";
import { saveChallenge, incrementChallengesCount, generateId, getOrCreateUser, canCreateChallenge } from "@/lib/storage";
import { Button } from "@/components/ui/button";

export default function CreateChallenge() {
  const [, navigate] = useLocation();
  const [questionCount, setQuestionCount] = useState(10);

  if (!canCreateChallenge()) {
    navigate("/");
    return null;
  }

  function handleStart() {
    const user = getOrCreateUser();
    const selectedQs = getRandomQuestions(questionCount);
    const challengeId = generateId();

    const challenge = {
      id: challengeId,
      creatorId: user.userId,
      creatorName: user.displayName || "مجهول",
      questions: selectedQs.map(q => q.id),
      creatorAnswers: new Array(questionCount).fill(null),
      creatorScore: 0,
      creatorTime: 0,
      createdAt: new Date().toISOString(),
      status: 'waiting' as const
    };

    saveChallenge(challenge);
    incrementChallengesCount();
    navigate(`/quiz/${challengeId}/creator`);
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
          ←
        </button>
        <h1 className="text-lg font-bold text-foreground">إنشاء تحدي جديد</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 fade-in-up">
          {/* Icon */}
          <div className="text-center">
            <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center mx-auto mb-4 gold-glow">
              <span className="text-4xl">⚔️</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">تحدي المعرفة</h2>
            <p className="text-muted-foreground text-sm mt-1">اختر عدد الأسئلة</p>
          </div>

          {/* Question count selector */}
          <div className="grid grid-cols-3 gap-3">
            {[5, 10, 15].map((count) => (
              <button
                key={count}
                onClick={() => setQuestionCount(count)}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  questionCount === count
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span className="block text-2xl font-black">{count}</span>
                <span className="text-xs">سؤال</span>
              </button>
            ))}
          </div>

          {/* Info card */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">الوقت لكل سؤال</span>
              <span className="text-primary font-bold">30 ثانية</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">عدد الأسئلة</span>
              <span className="text-primary font-bold">{questionCount} أسئلة</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">الوقت الكلي</span>
              <span className="text-primary font-bold">{questionCount / 2} دقيقة كحد أقصى</span>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4">
            <p className="text-secondary text-sm font-bold mb-2">كيف يعمل التحدي؟</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside text-right">
              <li>أجب على الأسئلة أولاً</li>
              <li>شارك الرابط مع صديقك</li>
              <li>يجيب صديقك على نفس الأسئلة</li>
              <li>اكتشف من الفائز!</li>
            </ol>
          </div>

          <Button
            onClick={handleStart}
            className="w-full h-14 text-lg font-bold gradient-gold text-background rounded-xl hover:opacity-90 transition-opacity"
          >
            🚀 ابدأ التحدي
          </Button>
        </div>
      </div>
    </div>
  );
}
