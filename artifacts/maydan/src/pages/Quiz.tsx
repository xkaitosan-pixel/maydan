import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { questions } from "@/lib/questions";
import { getChallenge, saveChallenge, getOrCreateUser } from "@/lib/storage";

const QUESTION_TIME = 30;

export default function Quiz() {
  const params = useParams<{ id: string; role: string }>();
  const [, navigate] = useLocation();
  const challengeId = params.id;
  const role = params.role as "creator" | "challenger";

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [startTime] = useState(Date.now());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [challengerName, setChallengerName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const challenge = getChallenge(challengeId);

  useEffect(() => {
    if (!challenge) {
      navigate("/");
      return;
    }

    // Check if challenger needs to enter name
    if (role === "challenger") {
      const user = getOrCreateUser();
      if (!user.displayName) {
        setShowNameInput(true);
      } else {
        setChallengerName(user.displayName);
      }
    }

    setAnswers(new Array(challenge.questions.length).fill(null));
  }, [challengeId, role]);

  const goToNextQuestion = useCallback((ans: (number | null)[]) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= (challenge?.questions.length || 0)) {
      // Quiz done
      finishQuiz(ans);
    } else {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setSelectedOption(null);
        setShowResult(false);
        setTimeLeft(QUESTION_TIME);
        setIsTransitioning(false);
      }, 600);
    }
  }, [currentIndex, challenge]);

  // Timer
  useEffect(() => {
    if (showResult || !challenge || showNameInput) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-advance with null answer
          const newAnswers = [...answers];
          newAnswers[currentIndex] = null;
          setAnswers(newAnswers);
          setShowResult(true);
          setTimeout(() => goToNextQuestion(newAnswers), 1200);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentIndex, showResult, answers, challenge, showNameInput]);

  function handleAnswer(optionIndex: number) {
    if (selectedOption !== null || showResult || isTransitioning) return;

    setSelectedOption(optionIndex);
    setShowResult(true);

    const newAnswers = [...answers];
    newAnswers[currentIndex] = optionIndex;
    setAnswers(newAnswers);

    setTimeout(() => goToNextQuestion(newAnswers), 1200);
  }

  function finishQuiz(finalAnswers: (number | null)[]) {
    if (!challenge) return;
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const questionList = challenge.questions.map(id => questions.find(q => q.id === id)!);
    const score = finalAnswers.reduce((acc, ans, idx) => {
      return acc + (ans === questionList[idx]?.correct ? 1 : 0);
    }, 0);

    const user = getOrCreateUser();
    const updatedChallenge = { ...challenge };

    if (role === "creator") {
      updatedChallenge.creatorAnswers = finalAnswers;
      updatedChallenge.creatorScore = score;
      updatedChallenge.creatorTime = totalTime;
      updatedChallenge.status = 'waiting' as const;
    } else {
      updatedChallenge.challengerAnswers = finalAnswers;
      updatedChallenge.challengerScore = score;
      updatedChallenge.challengerTime = totalTime;
      updatedChallenge.challengerName = challengerName || user.displayName || "المتحدي";
      updatedChallenge.status = 'completed' as const;
      updatedChallenge.completedAt = new Date().toISOString();
    }

    saveChallenge(updatedChallenge);
    navigate(`/results/${challengeId}/${role}`);
  }

  function handleNameSubmit() {
    if (!nameInput.trim()) return;
    setChallengerName(nameInput.trim());
    setShowNameInput(false);
  }

  if (!challenge) return null;

  const questionIds = challenge.questions;
  const currentQuestion = questions.find(q => q.id === questionIds[currentIndex]);

  if (!currentQuestion) return null;

  const timerPercent = (timeLeft / QUESTION_TIME) * 100;
  const isTimerDanger = timeLeft <= 10;

  // Name input screen for challenger
  if (showNameInput) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center fade-in-up">
          <div className="w-20 h-20 rounded-full gradient-purple flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🏆</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">مرحباً بك في التحدي!</h2>
          <p className="text-muted-foreground text-sm mb-6">
            تحداك <span className="text-primary font-bold">{challenge.creatorName}</span> في اختبار معرفة!
          </p>
          <div className="space-y-3">
            <input
              className="w-full p-3 rounded-xl border border-border bg-card text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              placeholder="أدخل اسمك..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              maxLength={20}
            />
            <button
              onClick={handleNameSubmit}
              disabled={!nameInput.trim()}
              className="w-full h-12 rounded-xl gradient-gold text-background font-bold disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              🚀 ابدأ التحدي
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-border/30">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-muted-foreground">
            سؤال {currentIndex + 1} من {questionIds.length}
          </span>
          <span className={`text-2xl font-black tabular-nums ${isTimerDanger ? "timer-danger" : "text-primary"}`}>
            {timeLeft}s
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{
              width: `${timerPercent}%`,
              background: isTimerDanger
                ? "hsl(0 70% 50%)"
                : "linear-gradient(90deg, hsl(45 85% 50%), hsl(270 60% 50%))"
            }}
          />
        </div>
        {/* Question progress dots */}
        <div className="flex gap-1 justify-center mt-2">
          {questionIds.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 rounded-full transition-all ${
                idx < currentIndex
                  ? "bg-primary w-4"
                  : idx === currentIndex
                  ? "bg-secondary w-6"
                  : "bg-muted w-2"
              }`}
            />
          ))}
        </div>
      </header>

      {/* Question */}
      <div className={`flex-1 flex flex-col p-4 ${isTransitioning ? "opacity-0 transition-opacity" : "opacity-100 transition-opacity"}`}>
        <div className="flex-1 flex flex-col justify-center">
          {/* Category */}
          <div className="text-center mb-4">
            <span className="bg-secondary/20 text-secondary text-xs px-3 py-1 rounded-full border border-secondary/30">
              {currentQuestion.category}
            </span>
          </div>

          {/* Question text */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-6 text-center slide-in">
            <p className="text-lg font-bold leading-relaxed text-foreground">
              {currentQuestion.question}
            </p>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((option, idx) => {
              let className = "option-btn w-full p-4 rounded-xl text-right font-medium text-sm bg-card";
              
              if (showResult) {
                if (idx === currentQuestion.correct) {
                  className += " correct";
                } else if (idx === selectedOption && idx !== currentQuestion.correct) {
                  className += " wrong";
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={showResult || isTransitioning}
                  className={className}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                      {["أ", "ب", "ج", "د"][idx]}
                    </span>
                    <span>{option}</span>
                    {showResult && idx === currentQuestion.correct && <span className="mr-auto">✓</span>}
                    {showResult && idx === selectedOption && idx !== currentQuestion.correct && <span className="mr-auto">✗</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Timeout message */}
          {showResult && selectedOption === null && (
            <div className="text-center mt-4 text-muted-foreground text-sm">
              انتهى الوقت! ⏰
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
