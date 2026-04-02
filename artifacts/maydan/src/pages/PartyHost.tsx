import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { questions, CATEGORIES } from "@/lib/questions";
import { playSound } from "@/lib/sound";

// ── Types ─────────────────────────────────────────────────────────────────────
type HostPhase = "setup" | "lobby" | "question" | "reveal" | "leaderboard" | "finished";

interface PartyPlayer {
  id: string;
  room_code: string;
  nickname: string;
  score: number;
  answered_current: boolean;
  last_answer: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const QUESTION_TIME = 20;
const MEDALS = ["🥇", "🥈", "🥉"];

const ANSWER_COLORS = [
  { bg: "#e74c3c", dark: "#c0392b", emoji: "🔴", letter: "أ" },
  { bg: "#3498db", dark: "#2980b9", emoji: "🔵", letter: "ب" },
  { bg: "#f39c12", dark: "#d68910", emoji: "🟡", letter: "ج" },
  { bg: "#27ae60", dark: "#1e8449", emoji: "🟢", letter: "د" },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  let hash = 0;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 0x9e3779b9);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    const j = Math.abs(hash) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getPartyQuestions(code: string, category: string, count: number) {
  const pool = category === "mix"
    ? questions.filter(q => q.category !== "legends")
    : questions.filter(q => q.category === category);
  return seededShuffle(pool, code + category).slice(0, Math.min(count, pool.length));
}

function calcPoints(elapsedMs: number): number {
  const maxMs = QUESTION_TIME * 1000;
  return Math.max(100, Math.round(1000 - (Math.min(elapsedMs, maxMs) / maxMs) * 900));
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function Confetti() {
  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${(i * 37 + 11) % 100}%`,
            top: `-${5 + (i * 7) % 25}%`,
            width: `${6 + (i * 3) % 8}px`,
            height: `${6 + (i * 5) % 8}px`,
            background: ["#f59e0b","#8b5cf6","#ef4444","#10b981","#3b82f6","#ec4899","#f97316"][i % 7],
            borderRadius: i % 3 === 0 ? "50%" : "2px",
            animation: `confetti-fall ${2 + (i % 4) * 0.5}s ${(i * 0.08) % 2.5}s ease-in both`,
          }} />
        ))}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PartyHost() {
  const [, navigate] = useLocation();

  // Local phase (mirrors DB status but with extra local states)
  const [phase, setPhase] = useState<HostPhase>("setup");
  const [roomCode, setRoomCode] = useState("");
  const [category, setCategory] = useState("mix");
  const [questionCount, setQuestionCount] = useState(10);
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [partyQs, setPartyQs] = useState<typeof questions>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [questionStartTime, setQuestionStartTime] = useState(0);

  // Refs to avoid stale closures
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeRef = useRef("");
  const phaseRef = useRef<HostPhase>("setup");
  const currentQIdxRef = useRef(0);
  const partyQsRef = useRef<typeof questions>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (codeRef.current) {
        supabase.from("party_rooms").update({ status: "finished" }).eq("code", codeRef.current);
      }
    };
  }, []);

  // ── Fetch players ────────────────────────────────────────────────────────
  const fetchPlayers = useCallback(async (code: string) => {
    const { data } = await supabase
      .from("party_players")
      .select("*")
      .eq("room_code", code)
      .order("score", { ascending: false });
    if (data) setPlayers(data as PartyPlayer[]);
  }, []);

  // ── Poll for player updates in lobby/reveal ───────────────────────────────
  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (phaseRef.current === "lobby" || phaseRef.current === "reveal" || phaseRef.current === "leaderboard") {
        fetchPlayers(code);
      }
    }, 2000);
  }

  // ── Create room ──────────────────────────────────────────────────────────
  async function createRoom() {
    setCreating(true);
    setError("");
    const code = generateCode();
    codeRef.current = code;

    const { error: err } = await supabase.from("party_rooms").insert({
      code,
      status: "lobby",
      category,
      total_questions: questionCount,
      current_question: 0,
    });
    if (err) { setError("خطأ في إنشاء الغرفة: " + err.message); setCreating(false); return; }

    const qs = getPartyQuestions(code, category, questionCount);
    setPartyQs(qs);
    partyQsRef.current = qs;
    setRoomCode(code);

    // Realtime subscriptions
    const channel = supabase
      .channel("host-room:" + code)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_players" },
        () => fetchPlayers(code))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "party_players" },
        () => { if (phaseRef.current === "question" || phaseRef.current === "reveal" || phaseRef.current === "leaderboard") fetchPlayers(code); })
      .subscribe();
    channelRef.current = channel;

    startPolling(code);
    phaseRef.current = "lobby";
    setPhase("lobby");
    setCreating(false);
  }

  // ── Start game ───────────────────────────────────────────────────────────
  async function startGame() {
    if (!roomCode || players.length === 0) return;
    if (pollRef.current) clearInterval(pollRef.current);
    playSound("match");
    await goToQuestion(0);
  }

  // ── Transition to a specific question ────────────────────────────────────
  async function goToQuestion(qIdx: number) {
    const now = Date.now();
    await supabase.from("party_rooms").update({
      status: "question",
      current_question: qIdx,
    }).eq("code", codeRef.current);

    // Reset player answers
    await supabase.from("party_players")
      .update({ answered_current: false, last_answer: null })
      .eq("room_code", codeRef.current);

    currentQIdxRef.current = qIdx;
    setCurrentQIdx(qIdx);
    setQuestionStartTime(now);
    phaseRef.current = "question";
    setPhase("question");
    startTimer(qIdx, now);
  }

  // ── Timer ────────────────────────────────────────────────────────────────
  function startTimer(qIdx: number, startMs: number) {
    setTimeLeft(QUESTION_TIME);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const remaining = Math.max(0, QUESTION_TIME - Math.floor(elapsed));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0) playSound("tick");
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        revealAnswers(qIdx, startMs);
      }
    }, 500);
  }

  // ── Check if all answered ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "question") return;
    const total = players.length;
    if (total > 0 && players.every(p => p.answered_current)) {
      if (timerRef.current) clearInterval(timerRef.current);
      revealAnswers(currentQIdxRef.current, questionStartTime);
    }
  }, [players, phase]);

  // ── Reveal answers & calculate scores ────────────────────────────────────
  const revealAnswers = useCallback(async (qIdx: number, startMs: number) => {
    if (phaseRef.current === "reveal") return;
    if (timerRef.current) clearInterval(timerRef.current);
    phaseRef.current = "reveal";
    setPhase("reveal");
    playSound("gameover");

    await supabase.from("party_rooms")
      .update({ status: "reveal" })
      .eq("code", codeRef.current);

    const q = partyQsRef.current[qIdx];
    const { data: allPlayers } = await supabase
      .from("party_players").select("*").eq("room_code", codeRef.current);

    if (allPlayers && q) {
      for (const p of allPlayers as PartyPlayer[]) {
        if (p.last_answer === q.correct && p.answered_current) {
          const elapsed = (Date.now() - startMs);
          const pts = calcPoints(elapsed);
          await supabase.from("party_players")
            .update({ score: p.score + pts })
            .eq("id", p.id);
        }
      }
    }
    await fetchPlayers(codeRef.current);

    // Auto-advance to leaderboard after 5 seconds
    setTimeout(async () => {
      await supabase.from("party_rooms")
        .update({ status: "leaderboard" })
        .eq("code", codeRef.current);
      await fetchPlayers(codeRef.current);
      phaseRef.current = "leaderboard";
      setPhase("leaderboard");
    }, 5000);
  }, [fetchPlayers]);

  // ── Next question / finish ───────────────────────────────────────────────
  async function goNext() {
    const nextIdx = currentQIdxRef.current + 1;
    if (nextIdx >= partyQsRef.current.length) {
      await supabase.from("party_rooms")
        .update({ status: "finished" })
        .eq("code", codeRef.current);
      await fetchPlayers(codeRef.current);
      phaseRef.current = "finished";
      setPhase("finished");
      playSound("gameover");
    } else {
      await goToQuestion(nextIdx);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const currentQ = partyQs[currentQIdx] ?? null;
  const answeredCount = players.filter(p => p.answered_current).length;
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const isDanger = timeLeft <= 5;
  const sorted = [...players].sort((a, b) => b.score - a.score);

  // Answer distribution for reveal
  const answerCounts = currentQ
    ? [0, 1, 2, 3].map(idx => players.filter(p => p.last_answer === idx).length)
    : [0, 0, 0, 0];
  const maxCount = Math.max(...answerCounts, 1);

  // ── SETUP ────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    const cats = [
      { id: "mix", name: "مزيج", icon: "🌐" },
      ...CATEGORIES.filter(c => !c.isPremium).map(c => ({ id: c.id, name: c.name, icon: c.icon })),
    ];
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-5 gap-6">
        <header className="flex items-center gap-3">
          <button onClick={() => navigate("/party")} className="text-muted-foreground text-xl">←</button>
          <h1 className="text-lg font-black">📺 إعداد اللعبة</h1>
        </header>

        <div className="space-y-6">
          <div>
            <p className="text-xs text-muted-foreground font-bold mb-3">الفئة</p>
            <div className="flex flex-wrap gap-2">
              {cats.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${category === c.id ? "bg-primary text-background border-primary" : "border-border text-muted-foreground"}`}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-bold mb-3">عدد الأسئلة</p>
            <div className="flex gap-3">
              {[10, 15, 20].map(n => (
                <button key={n} onClick={() => setQuestionCount(n)}
                  className={`flex-1 py-4 rounded-xl font-black text-lg border transition-all ${questionCount === n ? "text-background border-primary" : "bg-card border-border text-muted-foreground"}`}
                  style={questionCount === n ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-destructive text-sm text-center">{error}</p>}

          <button onClick={createRoom} disabled={creating}
            className="w-full h-14 rounded-2xl text-background font-black text-lg disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
            {creating ? "جاري الإنشاء..." : "🚀 إنشاء الغرفة"}
          </button>
        </div>
      </div>
    );
  }

  // ── LOBBY ────────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-5 gap-5">
        <header className="flex items-center gap-3">
          <h1 className="text-lg font-black text-primary">📺 غرفة الانتظار</h1>
          <button onClick={() => fetchPlayers(roomCode)} className="mr-auto text-muted-foreground text-sm">🔄</button>
        </header>

        {/* Big room code */}
        <div className="bg-card border-2 border-primary rounded-3xl p-6 text-center gold-glow">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">رمز الغرفة</p>
          <p className="text-7xl font-black text-primary tracking-widest tabular-nums" dir="ltr">{roomCode}</p>
          <p className="text-xs text-muted-foreground mt-3">وضع التجمعات ← انضم للغرفة</p>
          <button onClick={() => navigator.clipboard?.writeText(roomCode)}
            className="mt-3 px-4 py-1.5 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/30">
            📋 نسخ الرمز
          </button>
        </div>

        {/* Settings summary */}
        <div className="flex gap-2 justify-center flex-wrap">
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            {CATEGORIES.find(c => c.id === category)?.icon || "🌐"} {CATEGORIES.find(c => c.id === category)?.name || "مزيج"}
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            ❓ {questionCount} سؤال
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            ⏱️ {QUESTION_TIME}ث لكل سؤال
          </span>
        </div>

        {/* Live player list */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">اللاعبون ({players.length})</p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <p className="text-xs text-green-400">مباشر</p>
            </div>
          </div>
          {players.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-4xl mb-3">⌛</p>
              <p className="text-sm">في انتظار انضمام اللاعبين...</p>
              <p className="text-xs mt-1 opacity-60">شارك رمز الغرفة مع الأصدقاء</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 fade-in-up">
                  <span>{i < 3 ? MEDALS[i] : "🎮"}</span>
                  <span className="font-bold text-sm truncate">{p.nickname}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={startGame} disabled={players.length === 0}
          className="w-full h-14 rounded-2xl text-white font-black text-lg disabled:opacity-40 transition-opacity"
          style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
          🚀 ابدأ اللعبة ({players.length} {players.length === 1 ? "لاعب" : "لاعبين"})
        </button>
      </div>
    );
  }

  // ── QUESTION (TV screen) ─────────────────────────────────────────────────
  if (phase === "question" && currentQ) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        {/* Header */}
        <header className="p-3 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-muted-foreground font-bold px-2 py-1 bg-card rounded-lg">
              {currentQIdx + 1} / {partyQs.length}
            </span>
            <span className={`text-4xl font-black tabular-nums ${isDanger ? "timer-danger" : "text-primary"}`}>
              {timeLeft}
            </span>
            <span className="text-xs px-2 py-1 bg-card rounded-lg text-muted-foreground">
              {answeredCount}/{players.length} أجابوا
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 ease-linear"
              style={{
                width: `${timerPct}%`,
                background: isDanger ? "linear-gradient(90deg,#ef4444,#dc2626)" : "linear-gradient(90deg,#d97706,#f59e0b)",
              }} />
          </div>
        </header>

        {/* Question */}
        <div className="px-4 py-5">
          <div className="bg-card border border-border rounded-2xl p-5 text-center min-h-[80px] flex items-center justify-center">
            <p className="text-xl font-black leading-relaxed">{currentQ.question}</p>
          </div>
        </div>

        {/* 4 colored answer boxes */}
        <div className="flex-1 px-4 pb-4 grid grid-cols-2 gap-3">
          {ANSWER_COLORS.map((color, idx) => (
            <div key={idx} className="rounded-2xl flex flex-col items-center justify-center p-4 text-white font-black text-center min-h-[90px]"
              style={{ background: `linear-gradient(135deg,${color.bg},${color.dark})` }}>
              <span className="text-2xl">{color.emoji}</span>
              <span className="text-base mt-1 leading-tight">{currentQ.options[idx]}</span>
            </div>
          ))}
        </div>

        {/* Skip button */}
        <div className="p-4 border-t border-border/30">
          <button onClick={() => { if (timerRef.current) clearInterval(timerRef.current); revealAnswers(currentQIdx, questionStartTime); }}
            className="w-full py-2.5 rounded-xl bg-card border border-border text-sm text-muted-foreground font-bold">
            ⏭️ انتقل للنتيجة الآن
          </button>
        </div>
      </div>
    );
  }

  // ── REVEAL (3-5 seconds auto) ─────────────────────────────────────────────
  if (phase === "reveal" && currentQ) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-4 gap-4 overflow-y-auto">
        <h2 className="text-center text-sm font-bold text-muted-foreground">الإجابة الصحيحة</h2>

        {/* Answer boxes with highlight */}
        <div className="grid grid-cols-2 gap-3">
          {ANSWER_COLORS.map((color, idx) => {
            const isCorrect = idx === currentQ.correct;
            const count = answerCounts[idx];
            const barPct = (count / maxCount) * 100;
            return (
              <div key={idx} className="rounded-2xl overflow-hidden"
                style={{ background: isCorrect ? `linear-gradient(135deg,${color.bg},${color.dark})` : "hsl(var(--card))", border: isCorrect ? "none" : "2px solid hsl(var(--border))", opacity: isCorrect ? 1 : 0.4 }}>
                <div className="p-3 text-center">
                  <span className="text-xl">{color.emoji}</span>
                  <p className={`text-sm font-bold mt-1 ${isCorrect ? "text-white" : "text-muted-foreground"}`}>
                    {currentQ.options[idx]}
                  </p>
                  {isCorrect && <p className="text-white text-xs mt-1 font-black">✓ صحيح</p>}
                </div>
                {/* Mini bar chart */}
                <div className="px-3 pb-3">
                  <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: isCorrect ? "rgba(255,255,255,0.7)" : "rgba(100,100,100,0.3)", transition: "width 0.8s ease" }} />
                  </div>
                  <p className={`text-xs text-center mt-1 font-bold ${isCorrect ? "text-white" : "text-muted-foreground"}`}>{count} لاعب</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Top 3 instantly */}
        <div>
          <p className="text-xs text-muted-foreground font-bold mb-2 text-center">🏆 المتصدرون</p>
          <div className="space-y-2">
            {sorted.slice(0, 3).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5">
                <span className="text-xl">{MEDALS[i]}</span>
                <span className="font-bold text-sm flex-1">{p.nickname}</span>
                <span className="font-black text-primary">{p.score} نقطة</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground animate-pulse">جاري الانتقال للترتيب...</p>
      </div>
    );
  }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    const isLastQuestion = currentQIdx >= partyQs.length - 1;
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-5 gap-5">
        <h2 className="text-center text-xl font-black text-primary">🏆 الترتيب</h2>
        <p className="text-center text-xs text-muted-foreground">سؤال {currentQIdx + 1} من {partyQs.length}</p>

        <div className="flex-1 space-y-2">
          {sorted.slice(0, 5).map((p, i) => (
            <div key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                i === 1 ? "bg-slate-400/10 border-slate-400/20" :
                i === 2 ? "bg-orange-700/10 border-orange-700/20" :
                "bg-card border-border"
              }`}>
              <span className="text-2xl">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className="flex-1 font-bold">{p.nickname}</span>
              <div className="text-right">
                <p className="font-black text-primary text-lg">{p.score}</p>
                <p className="text-[10px] text-muted-foreground">نقطة</p>
              </div>
            </div>
          ))}
          {sorted.length > 5 && (
            <p className="text-center text-xs text-muted-foreground">+{sorted.length - 5} لاعبين آخرين</p>
          )}
        </div>

        <button onClick={goNext}
          className="w-full h-14 rounded-2xl text-white font-black text-lg"
          style={{ background: isLastQuestion ? "linear-gradient(135deg,#d97706,#f59e0b)" : "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
          {isLastQuestion ? "🏁 إنهاء اللعبة" : "▶ السؤال التالي"}
        </button>
      </div>
    );
  }

  // ── FINISHED (podium + confetti) ──────────────────────────────────────────
  if (phase === "finished") {
    const shareText = `🎉 انتهت لعبة ميدان!\n🥇 الفائز: ${sorted[0]?.nickname || "-"}\n🏆 الأعلى: ${sorted[0]?.score || 0} نقطة\nجرب أنت أيضاً!\n${window.location.origin}`;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 gap-6 text-center relative overflow-hidden">
        <Confetti />

        <div className="fade-in-up z-10">
          <p className="text-6xl mb-2">🏆</p>
          <h1 className="text-3xl font-black text-primary">انتهت اللعبة!</h1>
        </div>

        {/* Podium — top 3 */}
        {sorted.length >= 1 && (
          <div className="flex items-end gap-3 z-10">
            {/* 2nd place */}
            {sorted[1] && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl">🥈</span>
                <div className="bg-slate-400/20 border border-slate-400/30 rounded-t-xl px-3 py-2 h-20 flex flex-col items-center justify-end">
                  <p className="font-black text-sm">{sorted[1].nickname}</p>
                  <p className="text-primary font-bold text-xs">{sorted[1].score}</p>
                </div>
              </div>
            )}
            {/* 1st place */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl">🥇</span>
              <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-t-xl px-4 py-2 h-28 flex flex-col items-center justify-end">
                <p className="font-black text-base">{sorted[0]?.nickname}</p>
                <p className="text-primary font-bold text-sm">{sorted[0]?.score}</p>
              </div>
            </div>
            {/* 3rd place */}
            {sorted[2] && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl">🥉</span>
                <div className="bg-orange-700/20 border border-orange-700/30 rounded-t-xl px-3 py-2 h-16 flex flex-col items-center justify-end">
                  <p className="font-black text-sm">{sorted[2].nickname}</p>
                  <p className="text-primary font-bold text-xs">{sorted[2].score}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Full results */}
        <div className="w-full max-w-sm space-y-2 z-10">
          {sorted.slice(3).map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2">
              <span className="text-sm text-muted-foreground">#{i + 4}</span>
              <span className="flex-1 font-bold text-sm text-right">{p.nickname}</span>
              <span className="font-black text-primary">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 z-10">
          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
            className="px-5 py-3 rounded-xl text-white font-bold text-sm flex items-center gap-2"
            style={{ backgroundColor: "#25D366" }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            مشاركة
          </button>
          <button
            onClick={() => {
              setPhase("setup"); setPlayers([]); setRoomCode("");
              setCurrentQIdx(0); codeRef.current = ""; phaseRef.current = "setup";
            }}
            className="px-5 py-3 rounded-xl font-bold text-background text-sm"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
            لعبة جديدة
          </button>
          <button onClick={() => navigate("/")}
            className="px-5 py-3 rounded-xl font-bold bg-card border border-border text-foreground text-sm">
            الرئيسية
          </button>
        </div>
      </div>
    );
  }

  return null;
}
