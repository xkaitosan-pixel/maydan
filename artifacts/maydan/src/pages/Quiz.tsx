import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { getCategoryById, Question } from "@/lib/questions";
import { fetchQuestionsByIds } from "@/lib/questionService";
import QuestionImage from "@/components/QuestionImage";
import { getChallenge, saveChallenge, getOrCreateUser, recordGamePlayed, recordCategoryAnswers, getAvailablePowerCards, useSkipCard, useTimeCard } from "@/lib/storage";
import { playCorrect, playWrong, playTick } from "@/lib/sound";
import { XP_REWARDS } from "@/lib/gamification";

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
  const [skipAvail, setSkipAvail] = useState(0);
  const [timeAvail, setTimeAvail] = useState(0);
  const [powerUsed, setPowerUsed] = useState<{ skip: boolean; time: boolean }>({ skip: false, time: false });
  const [loadedQs, setLoadedQs] = useState<Question[]>([]);
  const [showXPPop, setShowXPPop] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const challenge = getChallenge(challengeId);
  const category = challenge ? getCategoryById(challenge.categoryId) : null;

  function loadPowerCards() {
    const cards = getAvailablePowerCards();
    setSkipAvail(cards.skip === Infinity ? 99 : cards.skip);
    setTimeAvail(cards.time === Infinity ? 99 : cards.time);
  }

  useEffect(() => {
    if (!challenge) { navigate("/"); return; }
    if (role === "challenger") {
      const user = getOrCreateUser();
      if (!user.displayName) setShowNameInput(true);
      else setChallengerName(user.displayName);
    }
    setAnswers(new Array(challenge.questions.length).fill(null));
    loadPowerCards();
    fetchQuestionsByIds(challenge.questions).then(setLoadedQs);
  }, [challengeId, role]);

  // Guarantee clean visual state on every question change (sync, before paint)
  useLayoutEffect(() => {
    console.log('[Quiz] Question changed, resetting selection', { currentIndex });
    setSelectedOption(null);
    setShowResult(false);
  }, [currentIndex]);

  const goToNextQuestion = useCallback((ans: (number | null)[]) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= (challenge?.questions.length || 0)) {
      finishQuiz(ans);
    } else {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setSelectedOption(null);
        setShowResult(false);
        setTimeLeft(QUESTION_TIME);
        setIsTransitioning(false);
        setPowerUsed({ skip: false, time: false });
      }, 600);
    }
  }, [currentIndex, challenge]);

  useEffect(() => {
    if (showResult || !challenge || showNameInput) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          const newAnswers = [...answers];
          newAnswers[currentIndex] = null;
          setAnswers(newAnswers);
          setShowResult(true);
          playWrong();
          setTimeout(() => goToNextQuestion(newAnswers), 1200);
          return 0;
        }
        if (prev <= 5) playTick();
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIndex, showResult, answers, challenge, showNameInput]);

  function handleAnswer(optionIndex: number) {
    if (selectedOption !== null || showResult || isTransitioning) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedOption(optionIndex);
    setShowResult(true);
    const newAnswers = [...answers];
    newAnswers[currentIndex] = optionIndex;
    setAnswers(newAnswers);
    if (optionIndex === currentQuestion?.correct) {
      playCorrect();
      setShowXPPop(true);
      setTimeout(() => setShowXPPop(false), 1100);
    } else {
      playWrong();
    }
    setTimeout(() => goToNextQuestion(newAnswers), 1200);
  }

  function handleSkip() {
    if (powerUsed.skip || skipAvail <= 0 || showResult || isTransitioning) return;
    if (!useSkipCard()) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setPowerUsed(prev => ({ ...prev, skip: true }));
    setSkipAvail(prev => prev - 1);
    // Skip = mark as null, move on
    const newAnswers = [...answers];
    newAnswers[currentIndex] = null;
    setAnswers(newAnswers);
    goToNextQuestion(newAnswers);
  }

  function handleAddTime() {
    if (powerUsed.time || timeAvail <= 0 || showResult) return;
    if (!useTimeCard()) return;
    setPowerUsed(prev => ({ ...prev, time: true }));
    setTimeAvail(prev => prev - 1);
    setTimeLeft(prev => Math.min(prev + 15, QUESTION_TIME + 15));
  }

  function finishQuiz(finalAnswers: (number | null)[]) {
    if (!challenge) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const questionList = challenge.questions.map(id => loadedQs.find(q => q.id === id)!);
    const score = finalAnswers.reduce<number>((acc, ans, idx) => acc + (ans === questionList[idx]?.correct ? 1 : 0), 0);

    // Record stats
    recordGamePlayed();
    const correct = finalAnswers.filter((ans, idx) => ans === questionList[idx]?.correct).length;
    recordCategoryAnswers(challenge.categoryId, correct, questionList.length);

    const user = getOrCreateUser();
    const updatedChallenge = { ...challenge };
    if (role === "creator") {
      updatedChallenge.creatorAnswers = finalAnswers;
      updatedChallenge.creatorScore = score;
      updatedChallenge.creatorTime = totalTime;
      updatedChallenge.status = "waiting" as const;
    } else {
      updatedChallenge.challengerAnswers = finalAnswers;
      updatedChallenge.challengerScore = score;
      updatedChallenge.challengerTime = totalTime;
      updatedChallenge.challengerName = challengerName || user.displayName || "المتحدي";
      updatedChallenge.status = "completed" as const;
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

  if (loadedQs.length === 0) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">جاري تحميل الأسئلة...</p>
        </div>
      </div>
    );
  }

  const questionIds = challenge.questions;
  const currentQuestion = loadedQs.find(q => q.id === questionIds[currentIndex]) ?? null;
  if (!currentQuestion) return null;

  const timerPercent = (timeLeft / QUESTION_TIME) * 100;
  const isTimerDanger = timeLeft <= 10;

  if (showNameInput) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center fade-in-up">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: category ? `linear-gradient(135deg, ${category.gradientFrom}, ${category.gradientTo})` : "" }}>
            <span className="text-4xl">{category?.icon || "⚔️"}</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">تحدي {category?.name}!</h2>
          <p className="text-muted-foreground text-sm mb-6">تحداك <span className="text-primary font-bold">{challenge.creatorName}</span></p>
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
              className="w-full h-12 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ background: category ? `linear-gradient(135deg, ${category.gradientFrom}, ${category.gradientTo})` : "hsl(45 85% 50%)" }}
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
      {/* Floating XP pop on correct answer */}
      {showXPPop && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-bounce">
          <div className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black text-white border border-purple-500/40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)", boxShadow: "0 4px 20px rgba(124,58,237,0.5)" }}>
            <span>⭐</span>
            <span>+{XP_REWARDS.correct_answer} XP</span>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="p-4 border-b border-border/30">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{category?.icon}</span>
            <span className="text-xs text-muted-foreground">{category?.name}</span>
          </div>
          <span className={`text-2xl font-black tabular-nums ${isTimerDanger ? "timer-danger" : ""}`}
            style={!isTimerDanger ? { color: category?.gradientFrom || "hsl(45 85% 50%)" } : {}}>
            {timeLeft}s
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{
            width: `${timerPercent}%`,
            background: isTimerDanger ? "hsl(0 70% 50%)" : `linear-gradient(90deg, ${category?.gradientFrom || "hsl(45 85% 50%)"}, ${category?.gradientTo || "hsl(270 60% 50%)"})`,
          }} />
        </div>
        <div className="flex gap-1 justify-center mt-2">
          {questionIds.map((_, idx) => (
            <div key={idx} className="h-1 rounded-full transition-all" style={{
              width: idx === currentIndex ? 24 : idx < currentIndex ? 16 : 8,
              backgroundColor: idx < currentIndex ? category?.gradientFrom || "hsl(45 85% 50%)" : idx === currentIndex ? category?.gradientTo || "hsl(270 60% 50%)" : "hsl(var(--muted))",
            }} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-1">{currentIndex + 1} / {questionIds.length}</p>
      </header>

      <div className={`flex-1 flex flex-col p-4 ${isTransitioning ? "opacity-0 transition-opacity" : "opacity-100 transition-opacity"}`}>
        <div key={currentIndex} className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-3">
            <span className="text-xs px-3 py-1 rounded-full" style={{ background: `${category?.gradientFrom}22`, color: category?.gradientFrom, border: `1px solid ${category?.gradientFrom}44` }}>
              {currentQuestion.difficulty === "easy" ? "سهل" : currentQuestion.difficulty === "medium" ? "متوسط" : "صعب"}
            </span>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 mb-4 text-center slide-in">
            {currentQuestion.image_url && (
              <QuestionImage url={currentQuestion.image_url} maxHeight={200} className="mb-3" />
            )}
            <p className="text-lg font-bold leading-relaxed">{currentQuestion.question}</p>
          </div>

          <div key={`answers-${currentIndex}-${currentQuestion.id}`} className="grid grid-cols-1 gap-3 mb-4">
            {currentQuestion.options.map((option, idx) => {
              const baseCls = "option-btn w-full p-4 rounded-xl text-right font-medium text-sm bg-card";
              let cls = baseCls;
              if (selectedOption !== null) {
                if (showResult) {
                  if (idx === currentQuestion.correct) cls = baseCls + " correct";
                  else if (idx === selectedOption) cls = baseCls + " wrong";
                } else if (idx === selectedOption) {
                  cls = baseCls + " selected";
                }
              } else if (showResult && idx === currentQuestion.correct) {
                cls = baseCls + " correct";
              }
              return (
                <button key={`${currentQuestion.id}-${idx}`} onClick={() => handleAnswer(idx)} disabled={showResult || isTransitioning} className={cls}>
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                      {["أ","ب","ج","د"][idx]}
                    </span>
                    <span className="flex-1">{option}</span>
                    {showResult && idx === currentQuestion.correct && <span>✓</span>}
                    {showResult && idx === selectedOption && idx !== currentQuestion.correct && <span>✗</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* POWER CARDS */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleSkip}
              disabled={powerUsed.skip || skipAvail <= 0 || showResult || isTransitioning}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                powerUsed.skip || skipAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                  : "border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
              }`}
            >
              <span>🔄</span>
              <span>تخطي</span>
              {skipAvail < 99 && <span className="text-xs opacity-70">({skipAvail})</span>}
            </button>
            <button
              onClick={handleAddTime}
              disabled={powerUsed.time || timeAvail <= 0 || showResult}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                powerUsed.time || timeAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
              }`}
            >
              <span>⏱️</span>
              <span>+15 ثانية</span>
              {timeAvail < 99 && <span className="text-xs opacity-70">({timeAvail})</span>}
            </button>
          </div>

          {showResult && selectedOption === null && (
            <div className="text-center mt-3 text-muted-foreground text-sm">انتهى الوقت! ⏰</div>
          )}
        </div>
      </div>
    </div>
  );
}
