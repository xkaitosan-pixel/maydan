import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchMixedDifficultyDailyQuestions } from "@/lib/questionService";
import { fetchQuestionsByIds } from "@/lib/questionService";
import CircularTimer from "@/components/CircularTimer";
import { Question } from "@/lib/questions";
import { shuffleQuestion } from "@/lib/shuffle";
import { playSound } from "@/lib/sound";
import { useBackgroundMusic } from "@/lib/useBackgroundMusic";
import { flashScreen } from "@/lib/flash";
import { recordTodayWin, recordTodayLoss, recordTodayXP } from "@/lib/storage";
import {
  getDailyPercentile,
  startDailyAttempt,
  submitDailyAnswer,
  type DailyAttempt,
} from "@/lib/db";
import { getCountryFlag } from "@/lib/countryUtils";
import ShareCard from "@/components/ShareCard";
import ReportFlag from "@/components/ReportFlag";
import { recordCompletedGameForInstall } from "@/lib/pwa";
import { getStableGuestId } from "@/lib/guestIdentity";

const DAILY_Q_COUNT = 10;
const QUESTION_TIME = 15;
const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50;

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DailyEntry {
  user_id: string;
  date?: string;
  display_name: string;
  country: string;
  score: number;
  total: number;
  completed_at: string;
}

export default function DailyChallenge() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, googleDisplayName, refreshUser } = useAuth();
  useBackgroundMusic("calm");

  const [phase, setPhase] = useState<"loading" | "intro" | "question" | "finished" | "already_done">("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [leaderboard, setLeaderboard] = useState<DailyEntry[]>([]);
  const [myEntry, setMyEntry] = useState<DailyEntry | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [showReveal, setShowReveal] = useState(false);
  const [combo, setCombo] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [secondsToNext, setSecondsToNext] = useState(0);
  const [personalRank, setPersonalRank] = useState<number | null>(null);
  const [attempt, setAttempt] = useState<DailyAttempt | null>(null);

  function comboMultiplier(c: number): number {
    if (c >= 10) return 2.5;
    if (c >= 6) return 2;
    if (c >= 3) return 1.5;
    return 1;
  }

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);
  const timerStartedRef = useRef(0);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const sessionActiveRef = useRef(true);
  const transitionTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  function clearTransitionTimeouts() {
    transitionTimeoutsRef.current.forEach(clearTimeout);
    transitionTimeoutsRef.current.clear();
  }

  function scheduleTransition(callback: () => void, delay: number) {
    const timeout = setTimeout(() => {
      transitionTimeoutsRef.current.delete(timeout);
      if (sessionActiveRef.current) callback();
    }, delay);
    transitionTimeoutsRef.current.add(timeout);
  }

  const today = getTodayDate();
  const guestIdRef = useRef<string | null>(null);
  if (isGuest && !guestIdRef.current) guestIdRef.current = getStableGuestId(localStorage);
  const userId = dbUser?.id ?? (isGuest ? `guest_${guestIdRef.current}` : null);
  const displayName = dbUser?.display_name ?? dbUser?.username ?? googleDisplayName ?? "زائر";
  const country = dbUser?.country ?? "";
  const answerStorageKey = `maydan_daily_answers_${today}_${userId ?? "anonymous"}`;

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      setSecondsToNext(Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [today]);

  useEffect(() => {
    if (!userId) { setPhase("intro"); return; }
    loadState();
  }, [userId]);

  async function loadState() {
    const qs = await fetchMixedDifficultyDailyQuestions("daily_" + today);
    if (!sessionActiveRef.current) return;
    // Deterministic shuffle by q.id — every player sees the same option order
    setQuestions(qs.map((q) => shuffleQuestion(q, q.id)));

    const { data: existing } = await supabase
      .from("daily_scores")
      .select("user_id, date, display_name, country, score, total, completed_at")
      .eq("user_id", userId!)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      setMyEntry(existing);
      setScore(existing.score);
      scoreRef.current = existing.score;
      try {
        const saved = localStorage.getItem(answerStorageKey);
        if (saved) setAnswers(JSON.parse(saved));
      } catch {
        // A corrupt local review must not block the completed state.
      }
      await loadLeaderboard();
      await loadPersonalRank(existing.score);
      setPhase("already_done");
    } else {
      await loadLeaderboard();
      setPhase("intro");
    }
  }

  async function loadLeaderboard() {
    const result = await supabase
      .from("daily_scores")
      .select("user_id, display_name, country, score, total, completed_at")
      .eq("date", today)
      .order("score", { ascending: false })
      .limit(10);
    if (result.data) {
      setLeaderboard(result.data as DailyEntry[]);
    }
    const countResult = await supabase
      .from("daily_scores")
      .select("user_id", { count: "exact", head: true })
      .eq("date", today);
    setTotalPlayers(countResult.count ?? result.data?.length ?? 0);
  }

  async function loadPersonalRank(entryScore: number) {
    const result = await supabase
      .from("daily_scores")
      .select("user_id", { count: "exact", head: true })
      .eq("date", today)
      .gt("score", entryScore);
    setPersonalRank((result.count ?? 0) + 1);
  }

  async function startChallenge() {
    if (!userId) return;
    if (!navigator.onLine) {
      alert("يتطلب تحدي اليوم اتصالاً بالإنترنت لضمان محاولة واحدة عادلة.");
      return;
    }
    let serverAttempt: DailyAttempt;
    try {
      serverAttempt = await startDailyAttempt({ userId, displayName, country });
    } catch (error) {
      console.error("start daily attempt failed", error);
      alert("تعذر بدء تحدي اليوم. تحقق من الاتصال وحاول مجدداً.");
      return;
    }
    if (serverAttempt.status === "completed") {
      await loadState();
      return;
    }
    sessionActiveRef.current = true;
    clearTransitionTimeouts();
    setAttempt(serverAttempt);
    if (serverAttempt.question_ids?.length) {
      const serverQuestions = await fetchQuestionsByIds(serverAttempt.question_ids);
      setQuestions(serverQuestions.map((q) => shuffleQuestion(q, q.id)));
    }
    scoreRef.current = serverAttempt.score;
    correctRef.current = serverAttempt.correct_count;
    setScore(serverAttempt.score);
    setPhase("question");
    setQIdx(serverAttempt.current_question_index);
    answeredRef.current = false;
    setSelected(null);
    setWasCorrect(null);
    setAnswers([]);
    localStorage.removeItem(answerStorageKey);
    setShowExitConfirm(false);
    startTimer(serverAttempt.question_started_at);
  }

  function requestExit() {
    setShowExitConfirm(true);
  }

  function cancelExit() {
    setShowExitConfirm(false);
  }

  function confirmExit() {
    sessionActiveRef.current = false;
    clearTransitionTimeouts();
    if (timerRef.current) clearInterval(timerRef.current);
    navigate("/");
  }

  function startTimer(serverStartedAt?: number) {
    setTimeLeft(QUESTION_TIME);
    timerStartedRef.current = serverStartedAt ?? Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!sessionActiveRef.current) {
        clearInterval(timerRef.current!);
        return;
      }
      const elapsed = (Date.now() - timerStartedRef.current) / 1000;
      const rem = Math.max(0, QUESTION_TIME - Math.floor(elapsed));
      setTimeLeft(rem);
      if (rem <= 3 && rem > 0) playSound("tick");
      if (rem <= 0) {
        clearInterval(timerRef.current!);
        if (!answeredRef.current) handleAnswer(-1);
      }
    }, 500);
  }

  async function handleAnswer(idx: number) {
    if (!sessionActiveRef.current || answeredRef.current) return;
    if (!attempt || !userId) return;
    answeredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const q = questions[qIdx];
    const correct = q && idx === q.correct;
    if (correct) {
      playSound("correct");
      flashScreen("correct");
    } else {
      playSound("wrong");
      flashScreen("wrong");
    }

    setSelected(idx);
    setWasCorrect(correct);
    setAnswers((prev) => {
      const next = [...prev];
      next[qIdx] = idx === -1 ? null : idx;
      localStorage.setItem(answerStorageKey, JSON.stringify(next));
      return next;
    });
    if (correct) {
      setCombo((c) => {
        const next = c + 1;
        if (next === 3 || next === 6 || next === 10) playSound("combo", next);
        return next;
      });
    } else {
      setCombo(0);
    }

    let updatedAttempt: DailyAttempt;
    try {
      updatedAttempt = await submitDailyAnswer({
        attemptId: attempt.id,
        userId,
        questionIndex: qIdx,
        questionId: q.id,
        answerText: idx === -1 ? null : q.options[idx] ?? null,
      });
    } catch (error) {
      console.warn("submit daily answer failed", error);
      answeredRef.current = false;
      setSelected(null);
      setWasCorrect(null);
      startTimer();
      return;
    }
    setAttempt(updatedAttempt);
    scoreRef.current = updatedAttempt.score;
    correctRef.current = updatedAttempt.correct_count;
    setScore(updatedAttempt.score);

    scheduleTransition(() => {
      const nextIdx = qIdx + 1;
      if (nextIdx >= DAILY_Q_COUNT) {
        finishChallenge(updatedAttempt);
      } else {
        setQIdx(nextIdx);
        setSelected(null);
        setWasCorrect(null);
        answeredRef.current = false;
        startTimer(updatedAttempt.question_started_at);
      }
    }, 900);
  }

  async function finishChallenge(finalAttempt: DailyAttempt) {
    if (!sessionActiveRef.current) return;
    const finalScore = finalAttempt.score;
    setPhase("finished");
    // Today-stats: count as win if ≥70 % accuracy
    const accPct = Math.round((correctRef.current / DAILY_Q_COUNT) * 100);
    if (accPct >= 70) recordTodayWin(); else recordTodayLoss();
    recordTodayXP(Math.round(finalScore / 5));
    playSound("gameover");
    recordCompletedGameForInstall();
    if (!userId) return;

    const entry: DailyEntry = {
      user_id: userId,
      date: today,
      display_name: displayName,
      country,
      score: finalScore,
      total: DAILY_Q_COUNT,
      completed_at: finalAttempt.completed_at ?? new Date().toISOString(),
    };
    if (!sessionActiveRef.current) return;
    setMyEntry(entry);
    if (dbUser?.id) void refreshUser();
    await loadLeaderboard();
    if (!sessionActiveRef.current) return;
    await loadPersonalRank(finalScore);
    // Fetch percentile (how the user compares to today's other players)
    getDailyPercentile(today, finalScore).then((p) => {
      if (sessionActiveRef.current) setPercentile(p);
    });
  }

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      clearTransitionTimeouts();
    };
  }, []);

  const ANSWER_COLORS = [
    { bg: "#e74c3c", emoji: "🔴" },
    { bg: "#3498db", emoji: "🔵" },
    { bg: "#f39c12", emoji: "🟡" },
    { bg: "#27ae60", emoji: "🟢" },
  ];

  const currentQ = questions[qIdx];
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const isDanger = timeLeft <= 5;
  const countdownText = `${String(Math.floor(secondsToNext / 3600)).padStart(2, "0")}:${String(Math.floor((secondsToNext % 3600) / 60)).padStart(2, "0")}:${String(secondsToNext % 60).padStart(2, "0")}`;

  if (phase === "loading") {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "already_done") {
    const myRank = personalRank;
    return (
      <div className="min-h-screen gradient-hero flex flex-col" dir="rtl">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">📅 تحدي اليوم</h1>
          <span className="mr-auto text-xs text-muted-foreground">{today}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full">
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
            <p className="text-5xl mb-2">✅</p>
            <h2 className="text-xl font-black text-green-400">أنهيت تحدي اليوم!</h2>
            <p className="text-foreground font-black text-3xl mt-2">{myEntry?.score} <span className="text-lg font-bold text-muted-foreground">نقطة</span></p>
            {myRank && myRank > 0 && (
              <p className="text-muted-foreground text-sm mt-1">مركزك اليوم: <span className="font-black text-foreground">#{myRank}</span> من {totalPlayers}</p>
            )}
            <div data-testid="text-daily-countdown-completed" className="mt-4 rounded-xl border border-primary/20 bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">التحدي القادم بعد</p>
              <p className="mt-1 font-mono text-2xl font-black tabular-nums text-primary" dir="ltr">{countdownText}</p>
            </div>
          </div>
          {answers.length > 0 && questions.length > 0 && (
            <DailyAnswerReview questions={questions} answers={answers} />
          )}
          <LeaderboardCard leaderboard={leaderboard} userId={userId} />
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col" dir="rtl">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">📅 تحدي اليوم</h1>
          <span className="mr-auto text-xs text-muted-foreground">{today}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full">
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <p className="text-5xl mb-3">📅</p>
            <h2 className="text-2xl font-black text-primary">تحدي اليوم</h2>
            <p className="text-muted-foreground text-sm mt-2">{DAILY_Q_COUNT} أسئلة · {QUESTION_TIME} ثانية لكل سؤال</p>
            <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>4 سهل · 4 متوسط · 2 صعب</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">فرصة واحدة يومياً · نفس الأسئلة لجميع اللاعبين</p>
            <p className="text-xs text-muted-foreground mt-1">أتمّ اليوم: {totalPlayers} لاعب</p>
            <div data-testid="text-daily-countdown-intro" className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">ينتهي تحدي اليوم بعد</p>
              <p className="mt-1 font-mono text-xl font-black tabular-nums text-primary" dir="ltr">{countdownText}</p>
            </div>
            <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs">
              <p className="font-bold text-primary">نظام النقاط ⚡</p>
              <p className="text-muted-foreground mt-1">إجابة صحيحة: 100 نقطة + مكافأة السرعة حتى 50 نقطة</p>
            </div>
            <button onClick={startChallenge}
              className="mt-5 w-full h-14 rounded-2xl text-background font-black text-lg"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
              🚀 ابدأ التحدي
            </button>
          </div>
          <LeaderboardCard leaderboard={leaderboard} userId={userId} />
        </div>
      </div>
    );
  }

  if (phase === "question" && currentQ) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col" dir="rtl">
        {showExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 text-center shadow-2xl">
              <h2 className="text-xl font-black">الخروج من التحدي؟</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                لديك محاولة واحدة فقط اليوم، ووقت السؤال يستمر على الخادم أثناء هذه الرسالة.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button data-testid="button-confirm-exit-daily" onClick={confirmExit} className="min-h-11 rounded-xl bg-red-600 px-3 font-bold text-white">خروج</button>
                <button data-testid="button-cancel-exit-daily" onClick={cancelExit} className="min-h-11 rounded-xl border border-border bg-card px-3 font-bold">متابعة</button>
              </div>
            </div>
          </div>
        )}
        <header className="p-4 border-b border-border/30">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button data-testid="button-exit-daily" onClick={requestExit} className="min-h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold">خروج</button>
            <span className="text-[10px] text-muted-foreground">الوقت محسوب من الخادم</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-muted-foreground">{qIdx + 1} / {DAILY_Q_COUNT}</span>
            <CircularTimer timeLeft={timeLeft} totalTime={QUESTION_TIME} size={72} />
            <div className="flex items-center gap-1.5">
              {combo >= 3 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-black text-white animate-pulse"
                  style={{
                    background: combo >= 10 ? "linear-gradient(135deg,#dc2626,#f59e0b)" : combo >= 6 ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "linear-gradient(135deg,#0ea5e9,#8b5cf6)",
                  }}
                >🔥{combo}×{comboMultiplier(combo)}</span>
              )}
              <span className="text-sm font-black text-primary">{score} نقطة</span>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col p-4 gap-4">
          <div className="flex-1 bg-card border border-border/40 rounded-2xl p-5 flex items-center justify-center relative">
            <ReportFlag
              questionId={currentQ.id}
              questionText={currentQ.question}
              reporter={displayName ?? null}
            />
            <p className="text-lg font-black text-center leading-relaxed">{currentQ.question}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {currentQ.options.map((opt, idx) => {
              const color = ANSWER_COLORS[idx];
              const isSelected = selected === idx;
              const hasAnswered = selected !== null;
              let bg = color.bg;
              let opacity = 1;

              if (hasAnswered) {
                if (isSelected && wasCorrect) {
                  bg = "#22c55e";
                } else if (isSelected && !wasCorrect) {
                  bg = "#ef4444";
                } else {
                  opacity = 0.35;
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={hasAnswered}
                  className="rounded-2xl p-4 flex flex-col items-center gap-2 text-white font-bold transition-all active:scale-95 disabled:cursor-default"
                  style={{ background: bg, opacity, minHeight: "90px" }}
                >
                  <span className="text-2xl">{isSelected ? (wasCorrect ? "✅" : "❌") : color.emoji}</span>
                  <span className="text-sm text-center leading-tight">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "finished") {
    const myRank = personalRank;
    const maxPossible = DAILY_Q_COUNT * (BASE_POINTS + MAX_SPEED_BONUS);
    const pct = Math.round((score / maxPossible) * 100);
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-start overflow-y-auto p-5 gap-6 text-center" dir="rtl">
        <div className="fade-in-up">
          <p className="text-7xl mb-3">{score >= 1200 ? "🏆" : score >= 700 ? "🎉" : "💪"}</p>
          <h1 className="text-3xl font-black text-primary">انتهى تحدي اليوم!</h1>
          <p className="text-4xl font-black mt-2 text-primary">{score}</p>
          <p className="text-sm text-muted-foreground">نقطة · {pct}% من الأقصى</p>
          {myRank !== null && myRank > 0 && (
            <p data-testid="text-daily-personal-rank" className="text-primary font-bold mt-2">مركزك اليوم: #{myRank} من {totalPlayers}</p>
          )}
          {percentile !== null && percentile > 0 && (
            <p className="text-sm font-bold mt-1" style={{ color: "#22c55e" }}>
              ⚡ تفوّقت على {percentile}% من اللاعبين اليوم
            </p>
          )}
          <div data-testid="text-daily-countdown-finished" className="mx-auto mt-4 w-full max-w-xs rounded-xl border border-primary/20 bg-card p-3">
            <p className="text-xs text-muted-foreground">التحدي القادم بعد</p>
            <p className="mt-1 font-mono text-xl font-black tabular-nums text-primary" dir="ltr">{countdownText}</p>
          </div>
        </div>

        {/* Answer reveal toggle */}
        {answers.length > 0 && questions.length > 0 && (
          <div className="w-full max-w-sm">
            <button
              data-testid="button-toggle-daily-review"
              onClick={() => setShowReveal((v) => !v)}
              className="w-full py-2.5 rounded-xl border border-border bg-card font-bold text-sm hover:border-primary/40 transition-colors"
            >
              {showReveal ? "إخفاء الأجوبة الصحيحة ▲" : "📖 عرض الأجوبة الصحيحة"}
            </button>
            {showReveal && (
              <div className="mt-3 space-y-2 text-right">
                {questions.map((q, i) => {
                  const my = answers[i];
                  const ok = my === q.correct;
                  return (
                    <div key={i} className="rounded-xl border border-border/40 bg-card p-3">
                      <p className="text-xs text-muted-foreground mb-1">السؤال {i + 1}</p>
                      <p className="text-sm font-bold mb-2 leading-relaxed">{q.question}</p>
                      <div className="space-y-1">
                        {q.options.map((opt, idx) => {
                          const isCorrect = idx === q.correct;
                          const isMine = idx === my;
                          return (
                            <div
                              key={idx}
                              className={`text-xs rounded-lg px-2.5 py-1.5 flex items-center gap-2 break-words ${
                                isCorrect
                                  ? "bg-green-500/15 text-green-700 dark:text-green-300"
                                  : isMine
                                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                  : "bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              <span className="shrink-0">{isCorrect ? "✓" : isMine ? "✗" : "•"}</span>
                              <span className="flex-1">{opt}</span>
                              {isMine && <span className="text-[10px] font-bold">{ok ? "إجابتك" : "إجابتك ✗"}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="w-full max-w-sm">
          <ShareCard
            playerName={dbUser?.username || "لاعب ميدان"}
            avatarUrl={dbUser?.avatar_url ?? null}
            countryCode={dbUser?.country ?? null}
            score={score}
            total={maxPossible}
            xpEarned={dbUser?.id ? 20 : 0}
            coinsEarned={dbUser?.id ? 15 : 0}
            category="تحدي اليوم"
            level={score >= 1200 ? "بطل اليوم" : score >= 700 ? "محارب" : "مبتدئ"}
            levelIcon={score >= 1200 ? "🏆" : score >= 700 ? "🎉" : "💪"}
            gameMode="daily"
          />
        </div>

        <div className="w-full max-w-sm">
          <LeaderboardCard leaderboard={leaderboard} userId={userId} />
        </div>

        <button onClick={() => navigate("/")}
          className="w-full max-w-sm h-14 rounded-2xl text-background font-black text-lg"
          style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
          العودة للرئيسية
        </button>
      </div>
    );
  }

  return null;
}

function DailyAnswerReview({ questions, answers }: { questions: Question[]; answers: (number | null)[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <button
        data-testid="button-toggle-completed-daily-review"
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 w-full rounded-xl border border-border bg-card px-3 font-bold"
      >
        {open ? "إخفاء مراجعة الإجابات ▲" : "📖 مراجعة إجاباتك"}
      </button>
      {open && (
        <div data-testid="panel-completed-daily-review" className="mt-3 space-y-2">
          {questions.map((question, questionIndex) => {
            const answer = answers[questionIndex];
            return (
              <article key={question.id} className="rounded-xl border border-border bg-card p-3 text-right">
                <p className="text-xs text-muted-foreground">السؤال {questionIndex + 1}</p>
                <p className="my-2 break-words text-sm font-bold leading-relaxed">{question.question}</p>
                <div className="space-y-1">
                  {question.options.map((option, optionIndex) => {
                    const correct = optionIndex === question.correct;
                    const chosen = optionIndex === answer;
                    return (
                      <p
                        key={optionIndex}
                        className={`break-words rounded-lg px-3 py-2 text-xs ${
                          correct
                            ? "bg-green-500/15 text-green-700 dark:text-green-300"
                            : chosen
                            ? "bg-red-500/15 text-red-700 dark:text-red-300"
                            : "bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <span className="ml-2">{correct ? "✓" : chosen ? "✗" : "•"}</span>
                        {option}
                        {chosen && <strong className="mr-2">إجابتك</strong>}
                      </p>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeaderboardCard({ leaderboard, userId }: { leaderboard: DailyEntry[]; userId: string | null }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <h3 className="font-bold text-sm">🏆 أفضل اليوم</h3>
      </div>
      {leaderboard.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">لا يوجد نتائج بعد — كن الأول!</p>
      ) : (
        <div className="divide-y divide-border/20">
          {leaderboard.map((e, i) => {
            const isMe = e.user_id === userId;
            return (
              <div key={e.user_id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? "bg-primary/5" : ""}`}>
                <span className="w-7 text-center font-black text-sm text-muted-foreground">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-black flex-shrink-0">
                  {(e.display_name || "م").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>
                    {e.display_name || "لاعب"} {isMe && "(أنت)"}
                  </p>
                  {e.country && <span className="text-xs">{getCountryFlag(e.country)}</span>}
                </div>
                <div className="text-right">
                  <p className="font-black text-primary text-sm">{e.score} <span className="text-xs text-muted-foreground font-normal">نقطة</span></p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
