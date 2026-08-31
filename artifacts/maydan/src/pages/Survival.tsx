import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { CATEGORIES, getCategoryById, Question } from "@/lib/questions";
import { fetchGameQuestions, fetchQuestionsByIds } from "@/lib/questionService";
import { shuffleQuestion } from "@/lib/shuffle";
import QuestionImage from "@/components/QuestionImage";
import ReportFlag from "@/components/ReportFlag";
import CircularTimer from "@/components/CircularTimer";
import CategoryCard from "@/components/CategoryCard";
import CategoryPicker from "@/components/CategoryPicker";
import { recordSurvivalGame, recordCategoryAnswers, getSurvivalRank, getAvailablePowerCards, useSkipCard, useTimeCard, getOrCreateUser, addLeaderboardEntry, canPlaySurvival, getRemainingSurvival, incrementSurvivalCount } from "@/lib/storage";
import { validateCategorySelectionKey } from "@/lib/categoriesService";
import { settleSurvivalGame, startSurvivalAttempt, type GameSettlementResult } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { playSound } from "@/lib/sound";
import { useBackgroundMusic } from "@/lib/useBackgroundMusic";
import { flashScreen } from "@/lib/flash";
import AchievementPopup from "@/components/AchievementPopup";
import FloatingReward from "@/components/FloatingReward";
import ShareCard from "@/components/ShareCard";
import { XP_REWARDS } from "@/lib/gamification";
import { recordTodayWin, recordTodayLoss, recordTodayXP } from "@/lib/storage";

const XP_PER_CORRECT = XP_REWARDS.correct_answer;

const LIVES_START = 3;
const BASE_TIME = 20;
const TIME_DECREMENT = 1;
const SPEED_EVERY = 5;
const MIN_TIME = 8;
const PENDING_SURVIVAL_SETTLEMENT_KEY = "maydan_pending_survival_settlement";
type PendingSurvivalSettlement = {
  attemptId: string;
  userId: string;
  username: string;
  answers: Array<{ questionId: number; answerText: string | null; skipped: boolean }>;
  displayCategory: string;
  displayScore: number;
};

function readPendingSurvivalSettlements(): Record<string, PendingSurvivalSettlement> {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SURVIVAL_SETTLEMENT_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePendingSurvivalSettlements(items: Record<string, PendingSurvivalSettlement>): void {
  try {
    localStorage.setItem(PENDING_SURVIVAL_SETTLEMENT_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("[survival] could not persist settlement retry queue", error);
  }
}

type Phase = "select" | "playing" | "gameover";

function getTimerForScore(score: number): number {
  const reductions = Math.floor(score / SPEED_EVERY);
  return Math.max(MIN_TIME, BASE_TIME - reductions * TIME_DECREMENT);
}


export default function Survival() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, refreshUser } = useAuth();
  useBackgroundMusic("calm");
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedCategory, setSelectedCategory] = useState<string>("mix");

  const searchParams = new URLSearchParams(window.location.search);
  const passedCat = searchParams.get("cat");

  useEffect(() => {
    if (passedCat && phase === "select") {
      void validateCategorySelectionKey(passedCat, !!dbUser?.is_premium).then((valid) => {
        if (!valid) return;
        setSelectedCategory(passedCat);
        void startGame(passedCat);
      });
    }
  }, [passedCat, dbUser?.is_premium]);

  // Game state
  const [lives, setLives] = useState(LIVES_START);
  const [score, setScore] = useState(0);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [usedIds, setUsedIds] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(BASE_TIME);
  const [maxTime, setMaxTime] = useState(BASE_TIME);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, number>>({});
  const [totalAnswers, setTotalAnswers] = useState<Record<string, number>>({});
  const [skipAvail, setSkipAvail] = useState(0);
  const [timeAvail, setTimeAvail] = useState(0);
  const [powerUsed, setPowerUsed] = useState<{ skip: boolean; time: boolean }>({ skip: false, time: false });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionPoolRef = useRef<Question[]>([]);
  const [showReward, setShowReward] = useState<{ xp: number; coins: number } | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [perAnswerXP, setPerAnswerXP] = useState(false);
  const [rewardSummary, setRewardSummary] = useState<{ xp: number; coins: number; achievements: number } | null>(null);
  const [settlementState, setSettlementState] = useState<"idle" | "pending" | "confirmed">("idle");
  const survivalAttemptIdRef = useRef<string | null>(null);
  const serverOrderedRunRef = useRef(false);
  const survivalAnswersRef = useRef<Array<{ questionId: number; answerText: string | null; skipped: boolean }>>([]);
  const pendingSettlementRef = useRef<PendingSurvivalSettlement | null>(null);

  useEffect(() => {
    if (!dbUser?.id || isGuest) return;
    try {
      const pendingMap = readPendingSurvivalSettlements();
      const pending = Object.values(pendingMap).find((item) => item.userId === dbUser.id);
      if (!pending) return;
      pendingSettlementRef.current = pending;
      setSelectedCategory(pending.displayCategory);
      setScore(pending.displayScore);
      setPhase("gameover");
      retrySurvivalSettlement();
    } catch {}
  }, [dbUser?.id, isGuest]);
  const [combo, setCombo] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [showFastBonus, setShowFastBonus] = useState(false);
  const answeredRef = useRef(false);
  const sessionActiveRef = useRef(true);
  const leaveWasPausedRef = useRef(false);
  const scheduledTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const personalBest = getOrCreateUser().stats.survivalBest;

  const clearScheduledTimeouts = useCallback(() => {
    scheduledTimeoutsRef.current.forEach(clearTimeout);
    scheduledTimeoutsRef.current.clear();
  }, []);

  const scheduleSessionUpdate = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      scheduledTimeoutsRef.current.delete(timeout);
      if (sessionActiveRef.current) callback();
    }, delay);
    scheduledTimeoutsRef.current.add(timeout);
  }, []);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    clearScheduledTimeouts();
  }, [clearScheduledTimeouts]);

  // Visual-only combo multiplier: x1 (combo<3) → x1.5 (3-5) → x2 (6-9) → x2.5 (10+)
  function comboMultiplier(c: number): number {
    if (c >= 10) return 2.5;
    if (c >= 6) return 2;
    if (c >= 3) return 1.5;
    return 1;
  }

  function loadPowerCards() {
    const cards = getAvailablePowerCards();
    setSkipAvail(cards.skip === Infinity ? 99 : cards.skip);
    setTimeAvail(cards.time === Infinity ? 99 : cards.time);
  }

  // Guarantee clean visual state on every question change (sync, before paint)
  useLayoutEffect(() => {
    setSelectedOption(null);
    setShowResult(false);
  }, [currentQ?.id]);

  async function startGame(forceCategory?: string) {
    if (!canPlaySurvival()) {
      alert("لقد استنفدت جولات وضع البقاء اليوم (5/يوم). ترقّ إلى ميدان برو لجولات غير محدودة.");
      navigate("/premium");
      return;
    }
    const catToUse = typeof forceCategory === "string" ? forceCategory : selectedCategory;
    sessionActiveRef.current = true;
    clearScheduledTimeouts();
    let rawPool: Question[];
    if (!isGuest && dbUser?.id) {
      const attempt = await startSurvivalAttempt({ userId: dbUser.id, category: catToUse });
      survivalAttemptIdRef.current = attempt.id;
      serverOrderedRunRef.current = true;
      rawPool = await fetchQuestionsByIds(attempt.question_ids);
      const byId = new Map(rawPool.map((question) => [question.id, question]));
      rawPool = attempt.question_ids.map((id) => byId.get(id)).filter((question): question is Question => !!question);
    } else {
      survivalAttemptIdRef.current = null;
      serverOrderedRunRef.current = false;
      rawPool = await fetchGameQuestions(catToUse);
    }
    const pool = rawPool.map((q) => shuffleQuestion(q));
    if (!pool.length || !sessionActiveRef.current) {
      sessionActiveRef.current = false;
      alert("تعذّر تحميل أسئلة وضع البقاء. تحقق من اتصالك وحاول مجددًا.");
      return;
    }
    incrementSurvivalCount();
    survivalAnswersRef.current = [];
    pendingSettlementRef.current = null;
    setSettlementState("idle");
    setRewardSummary(null);
    questionPoolRef.current = pool;
    const first = pool[0];
    const t = BASE_TIME;
    setLives(LIVES_START);
    setScore(0);
    setCombo(0);
    setUsedIds(new Set([first.id]));
    setCurrentQ(first);
    setTimeLeft(t);
    setMaxTime(t);
    setSelectedOption(null);
    setShowResult(false);
    setCorrectAnswers({});
    setTotalAnswers({});
    setPowerUsed({ skip: false, time: false });
    setIsPaused(false);
    setShowLeaveConfirm(false);
    setMilestone(null);
    setShowFastBonus(false);
    answeredRef.current = false;
    loadPowerCards();
    setPhase("playing");
  }

  // Timer effect
  const [isReporting, setIsReporting] = useState(false);
  useEffect(() => {
    if (phase !== "playing" || showResult || !currentQ || isReporting || isPaused) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (!sessionActiveRef.current) {
        clearInterval(timerRef.current!);
        return;
      }
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeOut();
          return 0;
        }
        if (prev <= 5) playSound("tick");
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, showResult, currentQ?.id, isReporting, isPaused]);

  const handleTimeOut = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!sessionActiveRef.current || !currentQ || answeredRef.current) return;
    answeredRef.current = true;
    survivalAnswersRef.current.push({ questionId: currentQ.id, answerText: null, skipped: false });
    setShowResult(true);
    playSound("wrong");
    setTotalAnswers(prev => ({ ...prev, [currentQ.category]: (prev[currentQ.category] || 0) + 1 }));

    setLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
          scheduleSessionUpdate(() => endGame(score), 900);
      } else {
          scheduleSessionUpdate(() => nextQuestion(), 900);
      }
      return newLives;
    });
  }, [currentQ, score, scheduleSessionUpdate]);

  function handleAnswer(idx: number) {
    if (!sessionActiveRef.current || answeredRef.current || selectedOption !== null || showResult || !currentQ || isPaused) return;
    answeredRef.current = true;
    survivalAnswersRef.current.push({
      questionId: currentQ.id,
      answerText: currentQ.options[idx] ?? null,
      skipped: false,
    });
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOption(idx);
    setShowResult(true);

    const isCorrect = idx === currentQ.correct;
    playSound(isCorrect ? "correct" : "wrong");
    flashScreen(isCorrect ? "correct" : "wrong");
    const cat = currentQ.category;
    setTotalAnswers(prev => ({ ...prev, [cat]: (prev[cat] || 0) + 1 }));

    if (isCorrect) {
      const newScore = score + 1;
      setScore(newScore);
      if (timeLeft >= Math.ceil(maxTime * 0.6)) {
        setShowFastBonus(true);
        scheduleSessionUpdate(() => setShowFastBonus(false), 800);
      }
      if (newScore === 10 || newScore === 25) {
        setMilestone(newScore);
        scheduleSessionUpdate(() => setMilestone(null), 1400);
      }
      setCombo(c => {
        const next = c + 1;
        if (next === 3 || next === 6 || next === 10) playSound("combo", next);
        return next;
      });
      setCorrectAnswers(prev => ({ ...prev, [cat]: (prev[cat] || 0) + 1 }));
      setPerAnswerXP(true);
      scheduleSessionUpdate(() => setPerAnswerXP(false), 900);
      scheduleSessionUpdate(() => nextQuestion(newScore), 900);
    } else {
      setCombo(0);
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          scheduleSessionUpdate(() => endGame(score), 900);
        } else {
          scheduleSessionUpdate(() => nextQuestion(score), 900);
        }
        return newLives;
      });
    }
  }

  function nextQuestion(currentScore?: number) {
    if (!sessionActiveRef.current) return;
    const s = currentScore ?? score;
    const pool = questionPoolRef.current.filter(q => !usedIds.has(q.id));
    if (!pool.length) { endGame(s); return; }
    const next = serverOrderedRunRef.current
      ? pool[0]
      : pool[Math.floor(Math.random() * pool.length)];

    const newMax = getTimerForScore(s);
    setUsedIds(prev => new Set([...prev, next.id]));
    setCurrentQ(next);
    setTimeLeft(newMax);
    setMaxTime(newMax);
    setSelectedOption(null);
    setShowResult(false);
    setPowerUsed({ skip: false, time: false });
    answeredRef.current = false;
  }

  function showConfirmedSettlement(result: GameSettlementResult) {
    const attemptId = pendingSettlementRef.current?.attemptId;
    const pendingMap = readPendingSurvivalSettlements();
    if (attemptId) delete pendingMap[attemptId];
    writePendingSurvivalSettlements(pendingMap);
    if (result.settled_score != null) setScore(result.settled_score);
    setSettlementState("confirmed");
    setShowReward({ xp: result.xp_gained, coins: result.coins_gained });
    setRewardSummary({ xp: result.xp_gained, coins: result.coins_gained, achievements: result.newly_unlocked.length });
    if (result.newly_unlocked.length > 0) {
      setNewAchievements(result.newly_unlocked);
      playSound("achievement");
    }
    if (result.coins_gained > 0) playSound("coin");
    if (result.new_level > (dbUser?.level ?? 1)) playSound("levelup");
    if (result.applied) recordTodayXP(result.xp_gained);
    void refreshUser();
    const next = Object.values(pendingMap).find((item) => item.userId === dbUser?.id);
    if (next) {
      pendingSettlementRef.current = next;
      setSelectedCategory(next.displayCategory);
      setScore(next.displayScore);
      queueMicrotask(retrySurvivalSettlement);
    } else {
      pendingSettlementRef.current = null;
    }
  }

  function retrySurvivalSettlement() {
    const pending = pendingSettlementRef.current;
    if (!pending) return;
    setSettlementState("pending");
    void settleSurvivalGame(pending)
      .then(showConfirmedSettlement)
      .catch(() => setSettlementState("pending"));
  }

  function endGame(finalScore: number) {
    if (!sessionActiveRef.current) return;
    // Claim completion synchronously before any side effect. Timeout and answer
    // callbacks can converge here, but only the first one may settle the run.
    sessionActiveRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    // Record stats
    recordSurvivalGame(finalScore);
    Object.keys(totalAnswers).forEach(cat => {
      recordCategoryAnswers(cat, correctAnswers[cat] || 0, totalAnswers[cat]);
    });
    const u = getOrCreateUser();
    if (isGuest && u.displayName) {
      addLeaderboardEntry({ name: u.displayName, score: finalScore, total: 0, category: selectedCategory, type: "survival" });
    }
    const supName = dbUser?.username ?? u.displayName;
    const attemptId = survivalAttemptIdRef.current;
    if (supName && !isGuest && dbUser?.id && attemptId) {
      pendingSettlementRef.current = {
        attemptId,
        userId: dbUser.id,
        username: supName,
        answers: [...survivalAnswersRef.current],
        displayCategory: selectedCategory,
        displayScore: finalScore,
      };
      const pendingMap = readPendingSurvivalSettlements();
      pendingMap[attemptId] = pendingSettlementRef.current;
      writePendingSurvivalSettlements(pendingMap);
      retrySurvivalSettlement();
    }
    if (isGuest) {
      if (finalScore >= 15) recordTodayWin(); else recordTodayLoss();
    }
    setScore(finalScore);
    setIsPaused(false);
    setPhase("gameover");
  }

  function handleSkip() {
    if (powerUsed.skip || skipAvail <= 0 || !currentQ || isPaused || answeredRef.current) return;
    answeredRef.current = true;
    if (!useSkipCard()) return;
    survivalAnswersRef.current.push({ questionId: currentQ.id, answerText: null, skipped: true });
    if (timerRef.current) clearInterval(timerRef.current);
    setPowerUsed(prev => ({ ...prev, skip: true }));
    setSkipAvail(prev => prev - 1);
    nextQuestion(score);
  }

  function leaveGame() {
    if (timerRef.current) clearInterval(timerRef.current);
    sessionActiveRef.current = false;
    clearScheduledTimeouts();
    setShowLeaveConfirm(false);
    setIsPaused(false);
    setPhase("select");
  }

  function requestLeave() {
    leaveWasPausedRef.current = isPaused;
    setIsPaused(true);
    setShowLeaveConfirm(true);
  }

  function cancelLeave() {
    setShowLeaveConfirm(false);
    setIsPaused(leaveWasPausedRef.current);
  }

  function handleAddTime() {
    if (powerUsed.time || timeAvail <= 0) return;
    if (!useTimeCard()) return;
    setPowerUsed(prev => ({ ...prev, time: true }));
    setTimeAvail(prev => prev - 1);
    setTimeLeft(prev => Math.min(prev + 15, maxTime + 15));
  }

  const user = getOrCreateUser();
  const rank = getSurvivalRank(score);
  const timerPct = maxTime > 0 ? (timeLeft / maxTime) * 100 : 0;
  const isTimerDanger = timeLeft < 6;
  const isTimerWarn = timeLeft >= 6 && timeLeft <= 10;
  const timerColor = isTimerDanger ? "#ef4444" : isTimerWarn ? "#f59e0b" : "#22c55e";
  const questionNumber = usedIds.size; // current question (1-indexed since first is added in startGame)

  // ── CATEGORY SELECT ──
  if (phase === "select") {
    const isPremium = !!(dbUser?.is_premium ?? user.isPremium);
    const survivalRemaining = getRemainingSurvival();

    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground text-xl"
          >←</button>
          <h1 className="text-lg font-bold">
            وضع البقاء 🏃
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="rp-narrow">
            <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4 mb-4 text-sm space-y-1.5">
              <p className="font-bold text-red-400 mb-2">⚔️ قواعد وضع البقاء</p>
              <p className="text-muted-foreground">❤️ لديك 3 أرواح — الإجابة الخاطئة تُفقدك روحاً</p>
              <p className="text-muted-foreground">⏱️ الوقت يبدأ 20 ثانية ويقل ثانية كل 5 أسئلة (الحد الأدنى 8)</p>
              <p className="text-muted-foreground">♾️ بدون حد للأسئلة — استمر حتى نهاية الأرواح</p>
              <p className="text-muted-foreground">🃏 لديك بطاقتا قوة: تخطي ووقت إضافي</p>
            </div>

            {!isPremium && (
              <div className="bg-purple-500/10 border border-purple-500/25 rounded-xl p-3 mb-3 text-center text-xs">
                <span className="text-purple-300 font-bold">🏃 الجولات المتبقية اليوم: </span>
                <span className="text-white font-black">{survivalRemaining === Infinity ? "∞" : survivalRemaining}</span>
                <span className="text-muted-foreground"> / 5</span>
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-3 text-center font-semibold">
                اختر الفئة
              </p>
              <CategoryPicker
                onSelect={(id) => setSelectedCategory(id)}
                isPremium={isPremium}
                includeMix={true}
                size="small"
                multiSelect={true}
                selectedIds={[selectedCategory]}
                onToggle={(id) => setSelectedCategory(id)}
              />
            </div>

            <button
              onClick={() => startGame()}
              className="w-full h-14 mt-5 rounded-xl text-white font-black text-lg transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
            >
              🏃 ابدأ البقاء
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME OVER ──
  if (phase === "gameover") {
    const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const shareText = `🏃 وضع البقاء في ميدان!\nوصلت إلى ${score} سؤالاً صحيحاً!\nرتبتي: ${rank.icon} ${rank.title}\nأفضل نتيجتي: ${user.stats.survivalBest}\nهل تستطيع التغلب عليّ؟\n${appUrl}`;

    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6">
        {showReward && (
          <FloatingReward xp={showReward.xp} coins={showReward.coins} onDone={() => setShowReward(null)} />
        )}
        {newAchievements.length > 0 && (
          <AchievementPopup unlockedIds={newAchievements} onDone={() => setNewAchievements([])} />
        )}
        <div className="w-full max-w-sm text-center fade-in-up space-y-5">
          <div className="text-7xl animate-bounce">{rank.icon}</div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">رتبتك</p>
            <p className="text-3xl font-black" style={{ color: rank.color }}>{rank.title}</p>
          </div>

          {/* Reward summary card */}
          {!isGuest && (
            <div className="rounded-2xl p-4 border border-yellow-500/20 text-right"
              style={{ background: "linear-gradient(135deg,rgba(217,119,6,0.1),rgba(139,92,246,0.1))" }}>
              <p className="text-xs font-bold text-yellow-400 mb-3 text-center">🎁 مكافآت هذه الجولة</p>
              {rewardSummary ? (
                <div className="flex justify-around">
                  <div className="text-center">
                    <p className="text-xl font-black text-purple-400">+{rewardSummary.xp}</p>
                    <p className="text-[10px] text-muted-foreground">⭐ XP</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-yellow-400">+{rewardSummary.coins}</p>
                    <p className="text-[10px] text-muted-foreground">🪙 قرش</p>
                  </div>
                  {rewardSummary.achievements > 0 && (
                    <div className="text-center">
                      <p className="text-xl font-black text-green-400">+{rewardSummary.achievements}</p>
                      <p className="text-[10px] text-muted-foreground">🏅 إنجاز</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                  {settlementState === "pending" && (
                    <button
                      onClick={retrySurvivalSettlement}
                      className="rounded-lg border border-yellow-400/30 px-3 py-1 text-xs font-bold text-yellow-300"
                    >
                      إعادة محاولة تأكيد المكافأة
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Score big */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="text-6xl font-black text-primary">{score}</p>
            <p className="text-muted-foreground text-sm mt-1">إجابة صحيحة</p>
            {score > (user.stats.survivalBest - 1) && score > 0 && (
              <p className="text-xs text-yellow-400 mt-2 font-bold">🏆 رقم قياسي جديد!</p>
            )}
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <div>
                <p className="font-bold text-foreground">{user.stats.survivalBest}</p>
                <p className="text-xs text-muted-foreground">أفضل رقم</p>
              </div>
              <div>
                <p className="font-bold text-foreground">{user.stats.survivalGames}</p>
                <p className="text-xs text-muted-foreground">إجمالي الألعاب</p>
              </div>
            </div>
          </div>

          {/* Professional Share Card */}
          <ShareCard
            playerName={dbUser?.username || user.displayName || "لاعب ميدان"}
            avatarUrl={dbUser?.avatar_url ?? null}
            countryCode={dbUser?.country ?? null}
            score={score}
            total={Math.max(score, user.stats.survivalBest, 1)}
            xpEarned={rewardSummary?.xp ?? 0}
            coinsEarned={rewardSummary?.coins ?? 0}
            category="وضع البقاء"
            level={rank.title}
            levelIcon={rank.icon}
            gameMode="survival"
          />

          {/* Rank guide */}
          <div className="bg-card border border-border rounded-2xl p-4 text-right text-sm space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2">جدول الرتب</p>
            {[
              { range: "0–5", icon: "🥉", title: "مبتدئ", active: score <= 5 },
              { range: "6–15", icon: "⚔️", title: "محارب", active: score >= 6 && score <= 15 },
              { range: "16–30", icon: "🥇", title: "بطل", active: score >= 16 && score <= 30 },
              { range: "+31", icon: "👑", title: "أسطورة", active: score >= 31 },
            ].map(r => (
              <div key={r.title} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${r.active ? "bg-primary/10" : ""}`}>
                <span>{r.icon}</span>
                <span className={r.active ? "font-bold text-primary" : "text-muted-foreground"}>{r.title}</span>
                <span className="mr-auto text-xs text-muted-foreground">{r.range}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
            className="w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2"
            style={{ backgroundColor: "#25D366" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            مشاركة النتيجة
          </button>
          <div className="space-y-3">
            <button data-testid="button-retry-survival" onClick={() => startGame()} className="w-full min-h-14 rounded-xl px-4 font-black text-lg text-white shadow-lg shadow-red-500/20" style={{ background: "linear-gradient(135deg,#b91c1c,#ef4444)" }}>
              🔥 حاول تحطيم رقمك — العب مجدداً
            </button>
            <button onClick={() => navigate("/")} className="w-full h-12 rounded-xl border border-border text-foreground font-bold bg-card hover:bg-card/80 transition-colors">
              🏠 الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING ──
  if (!currentQ) return null;
  const category = getCategoryById(currentQ.category);

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {milestone && (
        <div data-testid="status-survival-milestone" role="status" className="fixed inset-x-4 top-1/3 z-50 mx-auto max-w-sm rounded-3xl border border-yellow-500/40 bg-card p-6 text-center shadow-2xl motion-safe:animate-bounce">
          <p className="text-5xl">{milestone === 25 ? "👑" : "🏆"}</p>
          <p className="mt-2 text-2xl font-black text-yellow-500">{milestone} إجابة صحيحة!</p>
          <p className="text-sm text-muted-foreground">إنجاز رائع، واصل التحدي</p>
        </div>
      )}
      {showFastBonus && (
        <div data-testid="status-fast-answer-bonus" role="status" className="fixed top-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-cyan-500/30 bg-card px-4 py-2 text-sm font-black text-cyan-600 shadow-lg dark:text-cyan-300">
          ⚡ شارة سرعة فقط — لا تغيّر النقاط
        </div>
      )}
      {(isPaused || showLeaveConfirm) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 text-center shadow-2xl">
            {showLeaveConfirm ? (
              <>
                <h2 className="text-xl font-black">مغادرة الجولة؟</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">ستفقد كل تقدم هذه الجولة ولن تُسجّل نتيجتك الحالية.</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button data-testid="button-confirm-leave-survival" onClick={leaveGame} className="min-h-11 rounded-xl bg-red-600 px-3 font-bold text-white">غادر الجولة</button>
                  <button data-testid="button-cancel-leave-survival" onClick={cancelLeave} className="min-h-11 rounded-xl border border-border bg-card px-3 font-bold">واصل اللعب</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-5xl">⏸️</p>
                <h2 className="mt-2 text-2xl font-black">اللعبة متوقفة</h2>
                <p className="mt-1 text-sm text-muted-foreground">المؤقت متوقف حتى تستأنف</p>
                <button data-testid="button-resume-survival" onClick={() => setIsPaused(false)} className="mt-5 min-h-12 w-full rounded-xl bg-primary px-4 font-black text-primary-foreground">▶ استئناف</button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Per-answer XP pop */}
      {perAnswerXP && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-bounce">
          <div className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black text-white border border-purple-500/40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)", boxShadow: "0 4px 20px rgba(124,58,237,0.5)" }}>
            <span>⭐</span>
            <span>+{XP_PER_CORRECT} XP</span>
          </div>
        </div>
      )}
      <div className="rp-narrow flex flex-col flex-1 w-full">
      {/* Status bar */}
      <header className="p-4 border-b border-border/30 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button data-testid="button-leave-survival" onClick={requestLeave} className="min-h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold">خروج</button>
          <div data-testid="text-survival-personal-best" className="min-w-0 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-center">
            <span className="text-xs text-muted-foreground">أفضل نتيجة شخصية</span>
            <strong className="mr-2 text-lg text-yellow-600 dark:text-yellow-300">{Math.max(personalBest, score)}</strong>
          </div>
          <button data-testid="button-pause-survival" onClick={() => setIsPaused(true)} className="min-h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold">⏸ إيقاف</button>
        </div>
        <div className="flex justify-between items-center">
          {/* Lives */}
          <div key={`lives-${lives}`} className="flex gap-1.5">
            {Array.from({ length: LIVES_START }).map((_, i) => {
              const lost = i >= lives;
              const justLost = i === lives;
              return (
                <span
                  key={i}
                  className={`text-3xl transition-all ${
                    lost ? "opacity-25 grayscale scale-90" : "drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  } ${justLost ? "shake" : ""}`}
                >
                  {lost ? "🖤" : "❤️"}
                </span>
              );
            })}
          </div>
          {/* Score + question # + best */}
          <div className="text-center">
            <span className="text-2xl font-black text-primary">{score}</span>
            <p className="text-[10px] text-muted-foreground">
              #{questionNumber} • أفضل: {Math.max(personalBest, score)}
            </p>
          </div>
          {/* Timer */}
          <CircularTimer timeLeft={timeLeft} totalTime={maxTime} size={68} />
        </div>
        {lives === 1 && (
          <p data-testid="status-final-life-warning" role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm font-black text-red-600 dark:text-red-300">
            ⚠️ الروح الأخيرة — الخطأ القادم ينهي الجولة
          </p>
        )}

        {/* Speed + combo */}
        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-3 flex-wrap">
          <span>
            ⚡ <span className="text-primary font-bold">{maxTime}s</span>
            {score > 0 && score % SPEED_EVERY === 0 && maxTime < BASE_TIME && (
              <span className="text-red-400 mr-1.5 font-bold animate-pulse">— تسريع!</span>
            )}
          </span>
          {combo >= 3 && (
            <span
              className="px-2 py-0.5 rounded-full font-black text-white animate-pulse"
              style={{
                background: combo >= 10 ? "linear-gradient(135deg,#dc2626,#f59e0b)" : combo >= 6 ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "linear-gradient(135deg,#0ea5e9,#8b5cf6)",
              }}
            >
              🔥 {combo} متتالية × {comboMultiplier(combo)}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4">
        <div key={currentQ.id} className="flex-1 flex flex-col justify-center">
          {/* Category + difficulty */}
          <div className="flex justify-center gap-2 mb-3">
            <span className="text-xs px-3 py-1 rounded-full" style={{ background: `${category?.gradientFrom}22`, color: category?.gradientFrom, border: `1px solid ${category?.gradientFrom}44` }}>
              {category?.icon} {category?.name}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${
              currentQ.difficulty === "easy" ? "bg-green-500/15 text-green-400" :
              currentQ.difficulty === "medium" ? "bg-yellow-500/15 text-yellow-400" :
              "bg-red-500/15 text-red-400"
            }`}>
              {currentQ.difficulty === "easy" ? "سهل" : currentQ.difficulty === "medium" ? "متوسط" : "صعب"}
            </span>
          </div>

          {/* Question */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4 text-center slide-in relative">
            <ReportFlag
              questionId={currentQ.id}
              questionText={currentQ.question}
              reporter={dbUser?.username ?? null}
              onOpenChange={setIsReporting}
            />
            {currentQ.image_url && (
              <QuestionImage url={currentQ.image_url} maxHeight={200} className="mb-3" />
            )}
            <p className="text-lg font-bold leading-relaxed">{currentQ.question}</p>
          </div>

          {/* Options */}
          <div key={`answers-${currentQ.id}`} className="grid grid-cols-1 gap-3 mb-4">
            {currentQ.options.map((option, idx) => {
              const baseCls = "option-btn w-full p-4 rounded-xl text-right font-medium text-sm bg-card";
              let cls = baseCls;
              if (selectedOption !== null) {
                if (showResult) {
                  if (idx === currentQ.correct) cls = baseCls + " correct";
                  else if (idx === selectedOption) cls = baseCls + " wrong";
                } else if (idx === selectedOption) {
                  cls = baseCls + " selected";
                }
              } else if (showResult && idx === currentQ.correct) {
                cls = baseCls + " correct";
              }
              return (
                <button key={`${currentQ.id}-${idx}`} onClick={() => handleAnswer(idx)} disabled={showResult} className={cls}>
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                      {["أ","ب","ج","د"][idx]}
                    </span>
                    <span className="flex-1">{option}</span>
                    {showResult && idx === currentQ.correct && <span>✓</span>}
                    {showResult && idx === selectedOption && idx !== currentQ.correct && <span>✗</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* POWER CARDS */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleSkip}
              disabled={powerUsed.skip || skipAvail <= 0 || showResult}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                powerUsed.skip || skipAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                  : "border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
              }`}
            >
              <span>🔄</span>
              <span>تخطي</span>
              {skipAvail <= 2 && <span className="text-xs opacity-70">({skipAvail})</span>}
            </button>
            <button
              onClick={handleAddTime}
              disabled={powerUsed.time || timeAvail <= 0 || showResult}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                powerUsed.time || timeAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
              }`}
            >
              <span>⏱️</span>
              <span>+15 ثانية</span>
              {timeAvail <= 2 && <span className="text-xs opacity-70">({timeAvail})</span>}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
