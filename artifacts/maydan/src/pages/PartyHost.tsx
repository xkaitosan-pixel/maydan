import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { questions, CATEGORIES } from "@/lib/questions";

type Phase = "setup" | "lobby" | "playing" | "result" | "finished";

interface PartyPlayer {
  id: string;
  room_code: string;
  nickname: string;
  score: number;
  answered_current: boolean;
  last_answer: number | null;
}

const QUESTION_TIME = 20;
const RESULT_DELAY = 3000;
const MEDALS = ["🥇", "🥈", "🥉"];

function generateCode(): string {
  return "MAYDAN-" + Math.floor(1000 + Math.random() * 9000);
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
  const pool =
    category === "mix"
      ? questions.filter((q) => q.category !== "legends")
      : questions.filter((q) => q.category === category);
  return seededShuffle(pool, code + category).slice(0, Math.min(count, pool.length));
}

export default function PartyHost() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("setup");
  const [roomCode, setRoomCode] = useState("");
  const [category, setCategory] = useState("mix");
  const [questionCount, setQuestionCount] = useState(10);
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [partyQs, setPartyQs] = useState<typeof questions>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [resultVisible, setResultVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const codeRef = useRef("");

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (codeRef.current) {
        supabase.from("party_rooms").update({ status: "finished" }).eq("code", codeRef.current);
      }
    };
  }, []);

  async function fetchPlayers(code: string) {
    const { data } = await supabase
      .from("party_players")
      .select("*")
      .eq("room_code", code)
      .order("score", { ascending: false });
    if (data) setPlayers(data as PartyPlayer[]);
  }

  async function createRoom() {
    setCreating(true);
    setError("");
    const code = generateCode();
    codeRef.current = code;
    const { error: err } = await supabase.from("party_rooms").insert({
      code,
      status: "waiting",
      category,
      total_questions: questionCount,
      current_question: 0,
    });
    if (err) { setError("خطأ في إنشاء الغرفة: " + err.message); setCreating(false); return; }

    const qs = getPartyQuestions(code, category, questionCount);
    setPartyQs(qs);
    setRoomCode(code);

    const channel = supabase
      .channel("host-players:" + code)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_players", filter: `room_code=eq.${code}` },
        () => fetchPlayers(code))
      .subscribe();
    channelRef.current = channel;

    setPhase("lobby");
    setCreating(false);
  }

  async function startGame() {
    if (!roomCode || players.length === 0) return;
    await supabase.from("party_rooms").update({ status: "playing", current_question: 0 }).eq("code", roomCode);
    setCurrentQIdx(0);
    setPhase("playing");
    startTimer();
  }

  function startTimer() {
    setTimeLeft(QUESTION_TIME);
    setResultVisible(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); revealResult(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function revealResult() {
    if (timerRef.current) clearInterval(timerRef.current);
    setResultVisible(true);
    setPhase("result");

    const q = partyQs[currentQIdx];
    const { data: allPlayers } = await supabase.from("party_players").select("*").eq("room_code", roomCode);
    if (allPlayers) {
      for (const p of allPlayers as PartyPlayer[]) {
        if (p.last_answer === q.correct && p.answered_current) {
          await supabase.from("party_players").update({ score: p.score + 10 }).eq("id", p.id);
        }
      }
    }
    await fetchPlayers(roomCode);

    setTimeout(async () => {
      const nextIdx = currentQIdx + 1;
      if (nextIdx >= partyQs.length) {
        await supabase.from("party_rooms").update({ status: "finished" }).eq("code", roomCode);
        setPhase("finished");
        return;
      }
      await supabase.from("party_players").update({ answered_current: false, last_answer: null }).eq("room_code", roomCode);
      await supabase.from("party_rooms").update({ current_question: nextIdx }).eq("code", roomCode);
      setCurrentQIdx(nextIdx);
      setPhase("playing");
      startTimer();
    }, RESULT_DELAY);
  }

  const currentQ = partyQs[currentQIdx] ?? null;
  const answeredCount = players.filter((p) => p.answered_current).length;
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const isDanger = timeLeft <= 5;

  // ── SETUP ──────────────────────────────────────────────────────────────
  if (phase === "setup") {
    const cats = [{ id: "mix", name: "مزيج", icon: "🌐" }, ...CATEGORIES.filter((c) => !c.isPremium).map((c) => ({ id: c.id, name: c.name, icon: c.icon }))];
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-5 gap-5">
        <header className="flex items-center gap-3">
          <button onClick={() => navigate("/party")} className="text-muted-foreground text-xl">←</button>
          <h1 className="text-lg font-black">📺 إعداد الغرفة</h1>
        </header>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground font-bold mb-2">الفئة</p>
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${category === c.id ? "bg-primary text-background border-primary" : "border-border text-muted-foreground"}`}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-bold mb-2">عدد الأسئلة</p>
            <div className="flex gap-3">
              {[10, 20, 30].map((n) => (
                <button key={n} onClick={() => setQuestionCount(n)}
                  className={`flex-1 py-3 rounded-xl font-black border transition-all ${questionCount === n ? "gradient-gold text-background border-primary" : "bg-card border-border text-muted-foreground"}`}>
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

  // ── LOBBY ──────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-5 gap-5">
        <header className="flex items-center gap-3">
          <h1 className="text-lg font-black">📺 غرفة الانتظار</h1>
        </header>

        <div className="bg-card border-2 border-primary rounded-2xl p-5 text-center gold-glow">
          <p className="text-xs text-muted-foreground mb-1">رمز الغرفة</p>
          <p className="text-3xl font-black text-primary tracking-widest">{roomCode}</p>
          <p className="text-xs text-muted-foreground mt-2">اطلب من الأصدقاء الذهاب إلى</p>
          <p className="text-sm font-bold text-secondary mt-0.5">التطبيق ← وضع التجمعات ← انضم</p>
          <button
            onClick={() => { navigator.clipboard?.writeText(roomCode); }}
            className="mt-3 px-4 py-1.5 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/30"
          >📋 نسخ الرمز</button>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">اللاعبون ({players.length})</p>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <p className="text-xs text-green-400">مباشر</p>
            </div>
          </div>
          {players.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-3xl mb-2">⌛</p>
              <p className="text-sm">في انتظار اللاعبين...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                  <span className="text-xl">{i < 3 ? MEDALS[i] : `${i + 1}`}</span>
                  <span className="font-bold text-sm">{p.nickname}</span>
                  <span className="mr-auto text-green-400 text-xs">✓ انضم</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={startGame} disabled={players.length === 0}
          className="w-full h-14 rounded-2xl text-background font-black text-lg disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
          🚀 ابدأ اللعبة ({players.length} لاعبين)
        </button>
      </div>
    );
  }

  // ── PLAYING ────────────────────────────────────────────────────────────
  if ((phase === "playing" || phase === "result") && currentQ) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-bold">سؤال {currentQIdx + 1}/{partyQs.length}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">{answeredCount}/{players.length} أجابوا</span>
            </div>
            <span className={`text-3xl font-black tabular-nums ${isDanger ? "timer-danger" : "text-primary"}`}>{timeLeft}s</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${timerPct}%`, background: isDanger ? "#dc2626" : "linear-gradient(90deg,#d97706,#f59e0b)" }} />
          </div>
        </header>

        <div key={`${currentQIdx}`} className="flex-1 flex flex-col p-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <p className="text-xl font-black leading-relaxed">{currentQ.question}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {currentQ.options.map((opt, idx) => {
              let cls = "w-full p-4 rounded-xl text-right font-bold text-base border-2 transition-none";
              if (phase === "result") {
                cls += idx === currentQ.correct ? " border-green-500 bg-green-500/15 text-green-400" :
                  " border-border bg-card text-muted-foreground opacity-50";
              } else {
                cls += " border-border bg-card text-foreground";
              }
              return (
                <div key={idx} className={cls}>
                  <span className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full border-2 border-current flex items-center justify-center font-black shrink-0 text-sm">
                      {["أ", "ب", "ج", "د"][idx]}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {phase === "result" && idx === currentQ.correct && <span className="text-xl">✓</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {phase === "result" && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground text-center mb-2">الترتيب الحالي</p>
              {sorted.slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
                  <span className="text-sm">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
                  <span className="text-sm font-bold flex-1">{p.nickname}</span>
                  <span className="font-black text-primary">{p.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {phase === "playing" && (
          <div className="p-4 border-t border-border/30">
            <button onClick={revealResult} className="w-full py-3 rounded-xl bg-card border border-border text-sm text-muted-foreground font-bold">
              ⏭️ انتقل للنتيجة الآن
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── FINISHED ───────────────────────────────────────────────────────────
  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 gap-6 text-center">
        <div className="fade-in-up">
          <p className="text-6xl mb-3">🏆</p>
          <h1 className="text-3xl font-black text-primary">انتهت اللعبة!</h1>
          {sorted[0] && <p className="text-xl mt-2">الفائز: <span className="text-yellow-400 font-black">{sorted[0].nickname}</span></p>}
        </div>
        <div className="w-full max-w-sm space-y-2">
          {sorted.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${i === 0 ? "bg-yellow-500/10 border-yellow-500/30" : i === 1 ? "bg-slate-400/10 border-slate-400/20" : i === 2 ? "bg-orange-700/10 border-orange-700/20" : "bg-card border-border"}`}>
              <span className="text-2xl">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className="flex-1 font-bold text-right">{p.nickname}</span>
              <span className="font-black text-xl text-primary">{p.score}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setPhase("setup"); setPlayers([]); setRoomCode(""); setCurrentQIdx(0); codeRef.current = ""; }}
            className="px-6 py-3 rounded-xl font-bold text-background"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>لعبة جديدة</button>
          <button onClick={() => navigate("/")} className="px-6 py-3 rounded-xl font-bold bg-card border border-border text-foreground">الرئيسية</button>
        </div>
      </div>
    );
  }

  return null;
}
