import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchMixedDifficultyDailyQuestions } from "@/lib/questionService";
import { Question } from "@/lib/questions";
import { playSound } from "@/lib/sound";
import { getCountryFlag } from "@/lib/countryUtils";

const DAILY_Q_COUNT = 10;
const QUESTION_TIME = 15;
const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50;

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function calcPoints(elapsedSec: number): number {
  const bonus = Math.round(MAX_SPEED_BONUS * Math.max(0, (QUESTION_TIME - elapsedSec) / (QUESTION_TIME - 1)));
  return BASE_POINTS + bonus;
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
  const { dbUser, isGuest, googleDisplayName } = useAuth();

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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);
  const questionStartRef = useRef(0);
  const scoreRef = useRef(0);

  const today = getTodayDate();
  const userId = dbUser?.id ?? (isGuest ? "guest_" + (localStorage.getItem("maydan_guest_id") ?? Math.random().toString(36).slice(2)) : null);
  const displayName = dbUser?.display_name ?? dbUser?.username ?? googleDisplayName ?? "زائر";
  const country = dbUser?.country ?? "";

  useEffect(() => {
    if (!userId) { setPhase("intro"); return; }
    loadState();
  }, [userId]);

  async function loadState() {
    const qs = await fetchMixedDifficultyDailyQuestions("daily_" + today);
    setQuestions(qs);

    const { data: existing } = await supabase
      .from("daily_scores")
      .select("*")
      .eq("user_id", userId!)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      setMyEntry(existing);
      setScore(existing.score);
      scoreRef.current = existing.score;
      await loadLeaderboard();
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
      setTotalPlayers(result.data.length);
    }
  }

  function startChallenge() {
    scoreRef.current = 0;
    setScore(0);
    setPhase("question");
    setQIdx(0);
    answeredRef.current = false;
    setSelected(null);
    setWasCorrect(null);
    startTimer();
  }

  function startTimer() {
    setTimeLeft(QUESTION_TIME);
    questionStartRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const rem = Math.max(0, QUESTION_TIME - Math.floor(elapsed));
      setTimeLeft(rem);
      if (rem <= 3 && rem > 0) playSound("tick");
      if (rem <= 0) {
        clearInterval(timerRef.current!);
        if (!answeredRef.current) handleAnswer(-1);
      }
    }, 500);
  }

  function handleAnswer(idx: number) {
    if (answeredRef.current) return;
    answeredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const q = questions[qIdx];
    const correct = q && idx === q.correct;
    const elapsedSec = (Date.now() - questionStartRef.current) / 1000;

    if (correct) {
      playSound("correct");
      const pts = calcPoints(elapsedSec);
      scoreRef.current += pts;
      setScore(scoreRef.current);
    } else {
      playSound("wrong");
    }

    setSelected(idx);
    setWasCorrect(correct);

    setTimeout(() => {
      const nextIdx = qIdx + 1;
      if (nextIdx >= DAILY_Q_COUNT) {
        finishChallenge(scoreRef.current);
      } else {
        setQIdx(nextIdx);
        setSelected(null);
        setWasCorrect(null);
        answeredRef.current = false;
        startTimer();
      }
    }, 900);
  }

  async function finishChallenge(finalScore: number) {
    setPhase("finished");
    if (!userId) return;

    const entry: DailyEntry = {
      user_id: userId,
      date: today,
      display_name: displayName,
      country,
      score: finalScore,
      total: DAILY_Q_COUNT,
      completed_at: new Date().toISOString(),
    };

    await supabase
      .from("daily_scores")
      .upsert(entry, { onConflict: "user_id,date" });
    setMyEntry(entry);
    await loadLeaderboard();
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
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

  if (phase === "loading") {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "already_done") {
    const myRank = myEntry ? leaderboard.findIndex(e => e.user_id === userId) + 1 : null;
    const secondsUntilMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = Math.floor((midnight.getTime() - now.getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      return `${h}س ${m}د`;
    };
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
            <p className="text-xs text-muted-foreground mt-3">التحدي القادم في: {secondsUntilMidnight()}</p>
          </div>
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
        <header className="p-4 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold text-muted-foreground">{qIdx + 1} / {DAILY_Q_COUNT}</span>
            <span className={`text-4xl font-black tabular-nums ${isDanger ? "text-red-400" : "text-primary"}`}>{timeLeft}</span>
            <span className="text-sm font-black text-primary">{score} نقطة</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${timerPct}%`,
                background: isDanger ? "linear-gradient(90deg,#ef4444,#dc2626)" : "linear-gradient(90deg,#d97706,#f59e0b)"
              }} />
          </div>
        </header>

        <div className="flex-1 flex flex-col p-4 gap-4">
          <div className="flex-1 bg-card border border-border/40 rounded-2xl p-5 flex items-center justify-center">
            <p className="text-lg font-black text-center leading-relaxed">{currentQ.question}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
    const myRank = leaderboard.findIndex(e => e.user_id === userId) + 1;
    const maxPossible = DAILY_Q_COUNT * (BASE_POINTS + MAX_SPEED_BONUS);
    const pct = Math.round((score / maxPossible) * 100);
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 gap-6 text-center" dir="rtl">
        <div className="fade-in-up">
          <p className="text-7xl mb-3">{score >= 1200 ? "🏆" : score >= 700 ? "🎉" : "💪"}</p>
          <h1 className="text-3xl font-black text-primary">انتهى تحدي اليوم!</h1>
          <p className="text-4xl font-black mt-2 text-primary">{score}</p>
          <p className="text-sm text-muted-foreground">نقطة · {pct}% من الأقصى</p>
          {myRank > 0 && (
            <p className="text-primary font-bold mt-2">مركزك اليوم: #{myRank} من {leaderboard.length}</p>
          )}
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
