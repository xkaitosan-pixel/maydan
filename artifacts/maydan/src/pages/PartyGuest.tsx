import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { questions } from "@/lib/questions";

type Phase = "enter_code" | "enter_name" | "waiting" | "playing" | "answered" | "finished";

interface RoomData {
  id: string;
  code: string;
  status: string;
  category: string;
  current_question: number;
  total_questions: number;
}

interface PlayerRow {
  id: string;
  nickname: string;
  score: number;
  answered_current: boolean;
}

const MEDALS = ["🥇", "🥈", "🥉"];

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

export default function PartyGuest() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("enter_code");
  const [codeInput, setCodeInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState<RoomData | null>(null);
  const [myId, setMyId] = useState("");
  const [myScore, setMyScore] = useState(0);
  const [partyQs, setPartyQs] = useState<typeof questions>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myIdRef = useRef("");

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  async function lookupRoom() {
    setErrorMsg("");
    const code = codeInput.trim().toUpperCase();
    const { data, error } = await supabase
      .from("party_rooms")
      .select("*")
      .eq("code", code)
      .single();
    if (error || !data) { setErrorMsg("الغرفة غير موجودة. تحقق من الرمز."); return; }
    if (data.status === "finished") { setErrorMsg("انتهت هذه اللعبة بالفعل."); return; }
    setRoom(data as RoomData);
    setPhase("enter_name");
  }

  async function joinRoom() {
    if (!room || !nickname.trim()) return;
    setErrorMsg("");

    const { data: existing } = await supabase
      .from("party_players")
      .select("id")
      .eq("room_code", room.code)
      .eq("nickname", nickname.trim())
      .single();

    if (existing) { setErrorMsg("هذا الاسم موجود بالفعل في الغرفة. اختر اسماً آخر."); return; }

    const { data, error } = await supabase
      .from("party_players")
      .insert({ room_code: room.code, nickname: nickname.trim(), score: 0, answered_current: false })
      .select()
      .single();
    if (error || !data) { setErrorMsg("خطأ في الانضمام. حاول مجدداً."); return; }

    myIdRef.current = data.id;
    setMyId(data.id);

    const qs = getPartyQuestions(room.code, room.category || "mix", room.total_questions || 10);
    setPartyQs(qs);

    subscribeToRoom(room.code, data.id);
    fetchPlayers(room.code);
    setPhase("waiting");
  }

  function subscribeToRoom(code: string, pid: string) {
    const channel = supabase
      .channel("guest-room:" + code + ":" + pid)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "party_rooms", filter: `code=eq.${code}` },
        (payload) => handleRoomUpdate(payload.new as RoomData, pid))
      .on("postgres_changes", { event: "*", schema: "public", table: "party_players", filter: `room_code=eq.${code}` },
        () => fetchPlayers(code))
      .subscribe();
    channelRef.current = channel;
  }

  function handleRoomUpdate(updatedRoom: RoomData, pid: string) {
    setRoom(updatedRoom);
    if (updatedRoom.status === "playing") {
      const qIdx = updatedRoom.current_question;
      setCurrentQIdx(qIdx);
      setSelected(null);
      setShowAnswer(false);
      setPhase("playing");
      startTimer(qIdx);
    } else if (updatedRoom.status === "finished") {
      if (timerRef.current) clearInterval(timerRef.current);
      fetchPlayers(updatedRoom.code);
      setPhase("finished");
    }
  }

  function startTimer(qIdx: number) {
    setTimeLeft(20);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setShowAnswer(true);
          if (partyQs[qIdx]) {
            // No answer: mark as answered with null  
            supabase.from("party_players")
              .update({ answered_current: true, last_answer: null })
              .eq("id", myIdRef.current)
              .then(() => {});
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleAnswer(idx: number) {
    if (selected !== null || !myIdRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelected(idx);
    setShowAnswer(true);
    setPhase("answered");
    await supabase.from("party_players")
      .update({ answered_current: true, last_answer: idx })
      .eq("id", myIdRef.current);
  }

  async function fetchPlayers(code: string) {
    const { data } = await supabase
      .from("party_players")
      .select("id, nickname, score, answered_current")
      .eq("room_code", code)
      .order("score", { ascending: false });
    if (data) {
      setAllPlayers(data as PlayerRow[]);
      const me = (data as PlayerRow[]).find((p) => p.id === myIdRef.current);
      if (me) setMyScore(me.score);
    }
  }

  const currentQ = partyQs[currentQIdx] ?? null;
  const timerPct = (timeLeft / 20) * 100;
  const isDanger = timeLeft <= 5;
  const isCorrect = selected !== null && currentQ && selected === currentQ.correct;

  // ── ENTER CODE ─────────────────────────────────────────────────────────
  if (phase === "enter_code") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <p className="text-5xl mb-3">🎮</p>
          <h1 className="text-2xl font-black text-primary">انضم لغرفة</h1>
          <p className="text-muted-foreground text-sm mt-1">أدخل رمز الغرفة</p>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && lookupRoom()}
            placeholder="XXXX"
            className="w-full h-14 bg-card border-2 border-border rounded-xl px-4 text-center text-foreground text-3xl font-black placeholder:text-muted-foreground outline-none focus:border-primary tracking-widest"
            maxLength={4}
          />
          {errorMsg && <p className="text-destructive text-sm text-center">{errorMsg}</p>}
          <button onClick={lookupRoom} disabled={codeInput.length < 4}
            className="w-full h-12 rounded-xl font-black text-background disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            انضم
          </button>
        </div>
        <button onClick={() => navigate("/party")} className="text-muted-foreground text-sm">← رجوع</button>
      </div>
    );
  }

  // ── ENTER NAME ─────────────────────────────────────────────────────────
  if (phase === "enter_name") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <p className="text-5xl mb-3">👤</p>
          <h1 className="text-2xl font-black text-primary">أدخل اسمك</h1>
          <p className="text-muted-foreground text-sm mt-1">الغرفة: <span className="text-primary font-bold">{room?.code}</span></p>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="اسمك في اللعبة..."
            className="w-full h-12 bg-card border-2 border-border rounded-xl px-4 text-right text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            maxLength={20}
          />
          {errorMsg && <p className="text-destructive text-sm text-center">{errorMsg}</p>}
          <button onClick={joinRoom} disabled={!nickname.trim()}
            className="w-full h-12 rounded-xl font-black text-background disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            🚀 انضم للغرفة
          </button>
        </div>
      </div>
    );
  }

  // ── WAITING ────────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6 text-center">
        <div className="fade-in-up">
          <div className="w-20 h-20 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-3xl">⌛</span>
          </div>
          <h1 className="text-2xl font-black text-primary">في انتظار المضيف</h1>
          <p className="text-muted-foreground text-sm mt-1">مرحباً <span className="text-foreground font-bold">{nickname}</span>!</p>
        </div>
        <div className="w-full max-w-sm">
          <p className="text-xs text-muted-foreground font-bold mb-2">اللاعبون ({allPlayers.length})</p>
          <div className="space-y-2">
            {allPlayers.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 bg-card border rounded-xl px-3 py-2 ${p.id === myId ? "border-primary" : "border-border"}`}>
                <span className="text-green-400 text-xs">✓</span>
                <span className="text-sm font-bold">{p.nickname}</span>
                {p.id === myId && <span className="mr-auto text-xs text-primary">(أنت)</span>}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">اللعبة ستبدأ عندما يضغط المضيف على ابدأ</p>
      </div>
    );
  }

  // ── PLAYING / ANSWERED ─────────────────────────────────────────────────
  if ((phase === "playing" || phase === "answered") && currentQ) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-xs text-muted-foreground">سؤال {currentQIdx + 1}/{partyQs.length}</p>
              <p className="text-sm font-black text-primary">{myScore} نقطة</p>
            </div>
            <span className={`text-3xl font-black tabular-nums ${isDanger ? "timer-danger" : "text-primary"}`}>{timeLeft}s</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${timerPct}%`, background: isDanger ? "#dc2626" : "linear-gradient(90deg,#7c3aed,#8b5cf6)" }} />
          </div>
        </header>

        <div key={`${currentQIdx}-guest`} className="flex-1 flex flex-col justify-center p-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <p className="text-lg font-bold leading-relaxed">{currentQ.question}</p>
          </div>

          {phase === "answered" && showAnswer && (
            <div className={`py-3 rounded-2xl text-center font-black text-lg ${isCorrect ? "bg-green-500/20 border border-green-500/40 text-green-400" : "bg-red-500/20 border border-red-500/40 text-red-400"}`}>
              {isCorrect ? "🎉 إجابة صحيحة! +10 نقاط" : `❌ خطأ. الإجابة الصحيحة: ${["أ", "ب", "ج", "د"][currentQ.correct]}`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {currentQ.options.map((opt, idx) => {
              let cls = "w-full p-4 rounded-xl text-right font-bold text-base border-2 transition-none";
              if (showAnswer) {
                if (idx === currentQ.correct) cls += " border-green-500 bg-green-500/15 text-green-400";
                else if (idx === selected) cls += " border-red-500 bg-red-500/15 text-red-400";
                else cls += " border-border bg-card text-muted-foreground opacity-40";
              } else {
                cls += idx === selected
                  ? " border-primary bg-primary/15 text-primary"
                  : " border-border bg-card text-foreground";
              }
              return (
                <button key={idx} onClick={() => handleAnswer(idx)} disabled={phase === "answered" || showAnswer}
                  className={cls}>
                  <span className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full border-2 border-current flex items-center justify-center font-black shrink-0 text-sm">
                      {["أ", "ب", "ج", "د"][idx]}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {phase === "answered" && !showAnswer && (
            <p className="text-center text-muted-foreground text-sm animate-pulse">✓ تم! في انتظار بقية اللاعبين...</p>
          )}
        </div>
      </div>
    );
  }

  // ── FINISHED ───────────────────────────────────────────────────────────
  if (phase === "finished") {
    const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex((p) => p.id === myId) + 1;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 gap-6 text-center">
        <div className="fade-in-up">
          <p className="text-6xl mb-2">{myRank === 1 ? "🏆" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🎮"}</p>
          <h1 className="text-2xl font-black text-primary">انتهت اللعبة!</h1>
          <p className="text-muted-foreground mt-1">مركزك: <span className="text-foreground font-black">#{myRank}</span></p>
          <p className="text-primary font-black text-2xl mt-1">{myScore} نقطة</p>
        </div>

        <div className="w-full max-w-sm space-y-2">
          {sorted.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${i === 0 ? "bg-yellow-500/10 border-yellow-500/30" : i === 1 ? "bg-slate-400/10 border-slate-400/20" : i === 2 ? "bg-orange-700/10 border-orange-700/20" : "bg-card border-border"} ${p.id === myId ? "border-secondary" : ""}`}>
              <span className="text-xl">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className={`flex-1 font-bold text-right text-sm ${p.id === myId ? "text-secondary" : ""}`}>
                {p.nickname}{p.id === myId && " (أنت)"}
              </span>
              <span className="font-black text-primary">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => navigate("/party/guest")}
            className="px-6 py-3 rounded-xl font-bold text-background"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>انضم لغرفة جديدة</button>
          <button onClick={() => navigate("/")} className="px-6 py-3 rounded-xl font-bold bg-card border border-border text-foreground">الرئيسية</button>
        </div>
      </div>
    );
  }

  return null;
}
