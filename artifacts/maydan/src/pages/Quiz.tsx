import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { getCategoryById, Question } from "@/lib/questions";
import { fetchQuestionsByIds } from "@/lib/questionService";
import { useAuth } from "@/lib/AuthContext";
import { getChallenge, saveChallenge, getOrCreateUser, recordGamePlayed, recordCategoryAnswers, getAvailablePowerCards, useSkipCard, useTimeCard } from "@/lib/storage";
import { completeDbChallenge } from "@/lib/db";
import { playCorrect, playWrong, playTick } from "@/lib/sound";
import { useBackgroundMusic } from "@/lib/useBackgroundMusic";
import { flashScreen } from "@/lib/flash";
import { hapticCorrect, hapticWrong } from "@/lib/haptics";
import { sanitizeNickname } from "@/lib/sanitize";
import { XP_REWARDS } from "@/lib/gamification";
import { shuffleQuestion } from "@/lib/shuffle";

// New specialized components
import { GameHeader } from "@/components/game/GameHeader";
import { QuestionCard } from "@/components/game/QuestionCard";
import { AnswerOptions } from "@/components/game/AnswerOptions";
import { VersusIntro } from "@/components/game/VersusIntro";
import { ExitConfirmation } from "@/components/game/ExitConfirmation";

const QUESTION_TIME = 30;

export default function Quiz() {
  const params = useParams<{ id: string; role: string }>();
  const [, navigate] = useLocation();
  const { dbUser } = useAuth();
  useBackgroundMusic("calm");
  const [isReporting, setIsReporting] = useState(false);
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
  const [showIntro, setShowIntro] = useState(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);
  const transitionTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  const clearAllTimeouts = useCallback(() => {
    transitionTimeoutsRef.current.forEach(clearTimeout);
    transitionTimeoutsRef.current.clear();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    return () => clearAllTimeouts();
  }, [clearAllTimeouts]);

  const setTrackedTimeout = useCallback((cb: () => void, delay: number) => {
    const id = setTimeout(() => {
      transitionTimeoutsRef.current.delete(id);
      cb();
    }, delay);
    transitionTimeoutsRef.current.add(id);
    return id;
  }, []);

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
    // Deterministic shuffle by q.id so creator + challenger see identical option order
    fetchQuestionsByIds(challenge.questions).then((qs) =>
      setLoadedQs(qs.map((q) => shuffleQuestion(q, q.id)))
    );
  }, [challengeId, role]);

  // Guarantee clean visual state on every question change (sync, before paint)
  useLayoutEffect(() => {
    setSelectedOption(null);
    setShowResult(false);
  }, [currentIndex]);

  const goToNextQuestion = useCallback((ans: (number | null)[]) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= (challenge?.questions.length || 0)) {
      finishQuiz(ans);
    } else {
      setIsTransitioning(true);
      setTrackedTimeout(() => {
        setCurrentIndex(nextIndex);
        setSelectedOption(null);
        setShowResult(false);
        setTimeLeft(QUESTION_TIME);
        setIsTransitioning(false);
        setPowerUsed({ skip: false, time: false });
        answeredRef.current = false;
      }, 600);
    }
  }, [currentIndex, challenge, setTrackedTimeout]);

  useEffect(() => {
    if (showResult || !challenge || showNameInput || isReporting || showIntro || showExitConfirm) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          if (answeredRef.current) return 0;
          answeredRef.current = true;
          const newAnswers = [...answers];
          newAnswers[currentIndex] = null;
          setAnswers(newAnswers);
          setShowResult(true);
          playWrong();
          setTrackedTimeout(() => goToNextQuestion(newAnswers), 1200);
          return 0;
        }
        if (prev <= 5) playTick();
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIndex, showResult, answers, challenge, showNameInput, isReporting, showIntro, showExitConfirm, setTrackedTimeout, goToNextQuestion]);

  function handleAnswer(optionIndex: number) {
    if (answeredRef.current || selectedOption !== null || showResult || isTransitioning) return;
    answeredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedOption(optionIndex);
    setShowResult(true);
    const newAnswers = [...answers];
    newAnswers[currentIndex] = optionIndex;
    setAnswers(newAnswers);
    if (optionIndex === currentQuestion?.correct) {
      playCorrect();
      flashScreen("correct");
      hapticCorrect();
      setShowXPPop(true);
      setTrackedTimeout(() => setShowXPPop(false), 1100);
    } else {
      playWrong();
      flashScreen("wrong");
      hapticWrong();
    }
    setTrackedTimeout(() => goToNextQuestion(newAnswers), 1200);
  }

  function handleSkip() {
    if (answeredRef.current || powerUsed.skip || skipAvail <= 0 || showResult || isTransitioning) return;
    if (!useSkipCard()) return;
    answeredRef.current = true;
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
    clearAllTimeouts(); // Ensure no pending transitions fire while navigating away
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

    // Fire-and-forget: mirror challenger completion to Supabase so the creator
    // gets a "your challenge is complete" notification on any device.
    if (role !== "creator") {
      completeDbChallenge(challengeId, {
        opponent_name: updatedChallenge.challengerName ?? "متحدي",
        opponent_answers: finalAnswers,
        opponent_score: score,
      }).catch((e) => console.warn("[challenge] supabase complete failed", e));
    }

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
          <p className="text-muted-foreground text-sm mb-2">تحداك <span className="text-primary font-bold">{challenge.creatorName}</span></p>
          <p className="text-foreground font-bold text-base mb-5">أدخل اسمك للمنافسة</p>
          <div className="space-y-3">
            <input
              className="w-full p-3 rounded-xl border border-border bg-card text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              placeholder="اسمك..."
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
    <div className="min-h-[100dvh] gradient-hero flex flex-col">
      <ExitConfirmation
        open={showExitConfirm}
        onOpenChange={setShowExitConfirm}
        onExit={() => {
          clearAllTimeouts();
          navigate("/");
        }}
      />

      {showIntro && challenge && category && (
        <VersusIntro
          player1Name={role === "creator" ? (dbUser?.username || "أنت") : challenge.creatorName}
          player2Name={role === "creator" ? (challenge.challengerName || "المتحدي") : (challengerName || dbUser?.username || "أنت")}
          categoryName={category.name}
          categoryIcon={category.icon}
          gradientFrom={category.gradientFrom}
          gradientTo={category.gradientTo}
          onComplete={() => setShowIntro(false)}
        />
      )}

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

      <GameHeader
        category={category ?? null}
        currentIndex={currentIndex}
        totalQuestions={questionIds.length}
        timeLeft={timeLeft}
        totalTime={QUESTION_TIME}
        onExitClick={() => setShowExitConfirm(true)}
      />

      <div className={`flex-1 flex flex-col p-4 ${isTransitioning ? "opacity-0 transition-opacity" : "opacity-100 transition-opacity"}`}>
        <div key={currentIndex} className="flex-1 flex flex-col max-w-md mx-auto w-full pb-8">

          <QuestionCard
            question={currentQuestion.question}
            difficulty={currentQuestion.difficulty}
            imageUrl={currentQuestion.image_url}
            questionId={currentQuestion.id.toString()}
            reporterName={dbUser?.username ?? challengerName ?? null}
            onReportOpenChange={setIsReporting}
            categoryGradientFrom={category?.gradientFrom}
            categoryGradientTo={category?.gradientTo}
          />

          <div className="mt-6 mb-6">
            <AnswerOptions
              options={currentQuestion.options}
              selectedOption={selectedOption}
              correctOption={currentQuestion.correct}
              showResult={showResult}
              onSelect={handleAnswer}
              disabled={showResult || isTransitioning}
            />
          </div>

          {/* POWER CARDS */}
          <div className="flex gap-3 justify-center mt-auto">
            <button
              onClick={handleSkip}
              disabled={powerUsed.skip || skipAvail <= 0 || showResult || isTransitioning}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                powerUsed.skip || skipAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed bg-card"
                  : "border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/60 press-shrink"
              }`}
            >
              <span className="text-lg">🔄</span>
              <span>تخطي</span>
              {skipAvail < 99 && <span className="text-xs opacity-70 bg-purple-500/20 px-1.5 rounded-md">({skipAvail})</span>}
            </button>
            <button
              onClick={handleAddTime}
              disabled={powerUsed.time || timeAvail <= 0 || showResult}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                powerUsed.time || timeAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed bg-card"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/60 press-shrink"
              }`}
            >
              <span className="text-lg">⏱️</span>
              <span>+15 ثانية</span>
              {timeAvail < 99 && <span className="text-xs opacity-70 bg-yellow-500/20 px-1.5 rounded-md">({timeAvail})</span>}
            </button>
          </div>

          {showResult && selectedOption === null && (
            <div className="text-center mt-4 text-destructive font-bold text-sm animate-pulse bg-destructive/10 py-2 rounded-lg">انتهى الوقت! ⏰</div>
          )}
        </div>
      </div>
    </div>
  );
}
