import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Question } from "@/lib/questions";
import { fetchSeededQuestions } from "@/lib/questionService";
import QuestionImage from "@/components/QuestionImage";
import { playSound } from "@/lib/sound";

// ── Types ─────────────────────────────────────────────────────────────────────
type GuestPhase = "enter_code" | "enter_name" | "waiting" | "question" | "answered" | "reveal" | "leaderboard" | "finished";

interface RoomData {
  id: string;
  code: string;
  status: string;
  category: string;
  current_question: number;
  total_questions: number;
  answer_time?: number;
  show_question_on_phone?: boolean;
  scoring_type?: string;
}

interface PlayerRow {
  id: string;
  nickname: string;
  score: number;
  answered_current: boolean;
  last_answer: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_QUESTION_TIME = 20;
const MEDALS = ["🥇", "🥈", "🥉"];

const ANSWER_COLORS = [
  { bg: "#e74c3c", dark: "#c0392b", emoji: "🔴", label: "أ" },
  { bg: "#3498db", dark: "#2980b9", emoji: "🔵", label: "ب" },
  { bg: "#f39c12", dark: "#d68910", emoji: "🟡", label: "ج" },
  { bg: "#27ae60", dark: "#1e8449", emoji: "🟢", label: "د" },
];

function calcPoints(elapsedMs: number, answerTimeSec: number, scoring: string): number {
  if (scoring === "equal") return 1000;
  const maxMs = answerTimeSec * 1000;
  return Math.max(100, Math.round(1000 - (Math.min(elapsedMs, maxMs) / maxMs) * 900));
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

async function getPartyQuestions(code: string, category: string, count: number) {
  return fetchSeededQuestions(category, code + category, count);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PartyGuest() {
  const [, navigate] = useLocation();

  const [phase, setPhase] = useState<GuestPhase>("enter_code");
  const [codeInput, setCodeInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("code") ?? "";
  });
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState<RoomData | null>(null);
  const [myId, setMyId] = useState("");
  const [myScore, setMyScore] = useState(0);
  const [roundPoints, setRoundPoints] = useState<number | null>(null);
  const [partyQs, setPartyQs] = useState<Question[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_QUESTION_TIME);
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [showStreakBanner, setShowStreakBanner] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myIdRef = useRef("");
  const phaseRef = useRef<GuestPhase>("enter_code");
  const questionStartRef = useRef(0);
  const currentQIdxRef = useRef(-1);
  const consecutiveRef = useRef(0);
  // Track last seen DB state to avoid re-triggering transitions on every poll tick
  const lastSeenRef = useRef({ status: "", qIdx: -1 });

  // Auto-proceed when code arrives via QR scan URL (?code=XXXX)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code")?.replace(/\D/g, "");
    if (urlCode && urlCode.length === 4) {
      lookupRoomByCode(urlCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Fetch all players in room ────────────────────────────────────────────
  async function fetchPlayers(code: string) {
    const { data } = await supabase
      .from("party_players")
      .select("id, nickname, score, answered_current, last_answer")
      .eq("room_code", code)
      .order("score", { ascending: false });
    if (data) {
      setAllPlayers(data as PlayerRow[]);
      const me = (data as PlayerRow[]).find(p => p.id === myIdRef.current);
      if (me) setMyScore(me.score);
    }
  }

  // ── PRIMARY: poll party_rooms every 1.5s for all game state ─────────────
  // Realtime is unreliable; polling is the authoritative sync mechanism.
  function startRoomPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data: roomData } = await supabase
          .from("party_rooms").select("*").eq("code", code).single();
        if (!roomData) return;

        const newStatus = roomData.status as string;
        const newQIdx = roomData.current_question as number;
        const last = lastSeenRef.current;

        // Only trigger a phase transition when something actually changed in DB
        if (newStatus !== last.status || newQIdx !== last.qIdx) {
          lastSeenRef.current = { status: newStatus, qIdx: newQIdx };
          handleRoomUpdate(roomData as RoomData);
        }

        // Always refresh player list in social phases
        if (["waiting", "leaderboard", "finished", "reveal"].includes(phaseRef.current)) {
          fetchPlayers(code);
        }
      } catch { /* network hiccup, ignore */ }
    }, 1500);
  }

  // ── Step 1: look up room by code ─────────────────────────────────────────
  async function lookupRoomByCode(code: string) {
    setErrorMsg("");
    if (code.length !== 4) { setErrorMsg("أدخل رمزاً مكوناً من 4 أرقام."); return; }
    const { data, error } = await supabase
      .from("party_rooms").select("*").eq("code", code).single();
    if (error || !data) { setErrorMsg("الغرفة غير موجودة. تحقق من الرمز."); return; }
    if (data.status === "finished") { setErrorMsg("انتهت هذه اللعبة بالفعل."); return; }
    setRoom(data as RoomData);
    setPhase("enter_name");
  }

  async function lookupRoom() {
    await lookupRoomByCode(codeInput.trim());
  }

  // ── Step 2: join room with nickname ──────────────────────────────────────
  async function joinRoom() {
    if (!room || !nickname.trim()) return;
    setErrorMsg("");

    const { data: existing } = await supabase
      .from("party_players").select("id")
      .eq("room_code", room.code).eq("nickname", nickname.trim()).single();
    if (existing) { setErrorMsg("هذا الاسم محجوز. اختر اسماً آخر."); return; }

    const { data, error } = await supabase
      .from("party_players")
      .insert({ room_code: room.code, nickname: nickname.trim(), score: 0, answered_current: false })
      .select().single();
    if (error || !data) { setErrorMsg("خطأ في الانضمام. حاول مجدداً."); return; }

    myIdRef.current = data.id;
    setMyId(data.id);

    const qs = await getPartyQuestions(room.code, room.category || "mix", room.total_questions || 10);
    setPartyQs(qs);

    // Seed lastSeen so the first poll doesn't immediately fire a duplicate transition
    lastSeenRef.current = { status: "lobby", qIdx: 0 };

    // Realtime as secondary speed-boost; polling is the primary driver
    subscribeToRoom(room.code);
    fetchPlayers(room.code);
    // PRIMARY: poll party_rooms every 1.5s
    startRoomPolling(room.code);
    phaseRef.current = "waiting";
    setPhase("waiting");
  }

  // ── Realtime subscription (secondary / speed-boost only) ─────────────────
  // Polling is primary. Realtime gives instant response when it works.
  function subscribeToRoom(code: string) {
    const channel = supabase
      .channel("guest-room:" + code + ":" + Math.random())
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "party_rooms", filter: `code=eq.${code}` },
        (payload) => {
          const r = payload.new as RoomData;
          // Sync lastSeen so polling doesn't re-process this same change
          lastSeenRef.current = { status: r.status, qIdx: r.current_question };
          handleRoomUpdate(r);
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "party_players", filter: `room_code=eq.${code}` },
        () => fetchPlayers(code))
      .subscribe();
    channelRef.current = channel;
  }

  // ── Handle room status changes (called by poll AND realtime) ────────────
  function handleRoomUpdate(updatedRoom: RoomData) {
    setRoom(updatedRoom);
    const newStatus = updatedRoom.status;

    if (newStatus === "question") {
      const qIdx = updatedRoom.current_question;

      // Guard: this question is already active or answered — don't reset state
      if (
        qIdx === currentQIdxRef.current &&
        (phaseRef.current === "question" ||
         phaseRef.current === "answered" ||
         phaseRef.current === "reveal")
      ) return;

      // New question or first question — show answer buttons
      const now = Date.now();
      questionStartRef.current = now;
      currentQIdxRef.current = qIdx;
      setCurrentQIdx(qIdx);
      setSelected(null);
      setRoundPoints(null);
      phaseRef.current = "question";
      setPhase("question");
      startTimer(now);

    } else if (newStatus === "reveal") {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseRef.current === "reveal") return; // already there
      phaseRef.current = "reveal";
      setPhase("reveal");
      fetchPlayers(updatedRoom.code);

      // Play sound now that reveal is public — won't leak the correct answer
      const qIdx = updatedRoom.current_question;
      const revealQ = partyQs[qIdx];
      if (revealQ && selected !== null) {
        const wasCorrect = selected === revealQ.correct;
        if (wasCorrect) {
          playSound("correct");
          const newStreak = consecutiveRef.current + 1;
          consecutiveRef.current = newStreak;
          setConsecutiveCorrect(newStreak);
          if (newStreak >= 2) {
            setShowStreakBanner(true);
            setTimeout(() => setShowStreakBanner(false), 3000);
          }
        } else {
          playSound("wrong");
          consecutiveRef.current = 0;
          setConsecutiveCorrect(0);
        }
      }

    } else if (newStatus === "leaderboard") {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseRef.current === "leaderboard") return;
      phaseRef.current = "leaderboard";
      setPhase("leaderboard");
      fetchPlayers(updatedRoom.code);

    } else if (newStatus === "finished") {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseRef.current === "finished") return;
      phaseRef.current = "finished";
      setPhase("finished");
      fetchPlayers(updatedRoom.code);
      playSound("gameover");
    }
    // "lobby" status → stay on waiting screen, nothing to do
  }

  // ── Local countdown timer (uses room's answer_time setting) ─────────────
  function startTimer(startMs: number) {
    // Read room data at call time (polling has updated it by now)
    const totalSec = room?.answer_time || DEFAULT_QUESTION_TIME;
    setTimeLeft(totalSec);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const remaining = Math.max(0, totalSec - Math.floor(elapsed));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0) playSound("tick");
      if (remaining <= 0) clearInterval(timerRef.current!);
    }, 500);
  }

  // ── Answer a question ────────────────────────────────────────────────────
  async function handleAnswer(idx: number) {
    if (selected !== null || phaseRef.current !== "question") return;
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsedMs = Date.now() - questionStartRef.current;
    const q = partyQs[currentQIdx];
    const isCorrect = q && idx === q.correct;
    const roomAnswerTime = room?.answer_time || DEFAULT_QUESTION_TIME;
    const roomScoring = room?.scoring_type || "speed";
    const pts = isCorrect ? calcPoints(elapsedMs, roomAnswerTime, roomScoring) : 0;

    setSelected(idx);
    setRoundPoints(pts);
    phaseRef.current = "answered";
    setPhase("answered");

    // sounds deferred to reveal phase so correct answer isn't leaked

    // Update DB: record answer and new cumulative score
    await supabase.from("party_players")
      .update({
        answered_current: true,
        last_answer: idx,
        score: myScore + pts,
      })
      .eq("id", myIdRef.current);

    setMyScore(prev => prev + pts);
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const currentQ = partyQs[currentQIdx] ?? null;
  const roomAnswerTime = room?.answer_time || DEFAULT_QUESTION_TIME;
  const timerPct = (timeLeft / roomAnswerTime) * 100;
  const isDanger = timeLeft <= 5;
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const myRank = sorted.findIndex(p => p.id === myId) + 1;
  const isCorrectAnswer = selected !== null && currentQ ? selected === currentQ.correct : false;

  // ── ENTER CODE ───────────────────────────────────────────────────────────
  if (phase === "enter_code") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center fade-in-up">
          <p className="text-6xl mb-3">🎮</p>
          <h1 className="text-3xl font-black text-primary">انضم للعبة</h1>
          <p className="text-muted-foreground text-sm mt-2">أدخل رمز الغرفة المكون من 4 أرقام</p>
        </div>
        <div className="w-full max-w-sm md:max-w-md space-y-4">
          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && lookupRoom()}
            placeholder="0000"
            className="w-full h-20 bg-card border-2 border-border rounded-2xl px-4 text-center text-foreground text-5xl font-black placeholder:text-muted-foreground outline-none focus:border-primary tracking-widest"
            maxLength={4}
            inputMode="numeric"
            dir="ltr"
          />
          {errorMsg && <p className="text-destructive text-sm text-center">{errorMsg}</p>}
          <button onClick={lookupRoom} disabled={codeInput.length < 4}
            className="w-full h-14 rounded-2xl font-black text-white text-lg disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            انضم
          </button>
        </div>
        <button onClick={() => navigate("/party")} className="text-muted-foreground text-sm">← رجوع</button>
      </div>
    );
  }

  // ── ENTER NAME ───────────────────────────────────────────────────────────
  if (phase === "enter_name") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center fade-in-up">
          <p className="text-6xl mb-3">👤</p>
          <h1 className="text-2xl font-black text-primary">أدخل اسمك</h1>
          <p className="text-muted-foreground text-sm mt-1">
            الغرفة: <span className="text-primary font-bold">{room?.code}</span>
          </p>
        </div>
        <div className="w-full max-w-sm md:max-w-md space-y-4">
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === "Enter" && joinRoom()}
            placeholder="اسمك في اللعبة..."
            className="w-full h-14 bg-card border-2 border-border rounded-xl px-4 text-right text-foreground text-lg placeholder:text-muted-foreground outline-none focus:border-primary"
            maxLength={20}
            autoFocus
          />
          {errorMsg && <p className="text-destructive text-sm text-center">{errorMsg}</p>}
          <button onClick={joinRoom} disabled={!nickname.trim()}
            className="w-full h-14 rounded-2xl font-black text-white text-lg disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            🚀 انضم للغرفة
          </button>
        </div>
      </div>
    );
  }

  // ── WAITING ──────────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6 text-center">
        <div className="fade-in-up">
          <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-4xl">⌛</span>
          </div>
          <h1 className="text-2xl font-black text-primary">في انتظار بدء اللعبة</h1>
          <p className="text-muted-foreground text-sm mt-1">
            مرحباً <span className="text-foreground font-bold">{nickname}</span>!
          </p>
          <p className="text-xs text-muted-foreground mt-1">الغرفة: <span className="font-bold text-primary">{room?.code}</span></p>
        </div>
        <div className="w-full max-w-sm">
          <p className="text-xs text-muted-foreground font-bold mb-3">اللاعبون ({allPlayers.length})</p>
          <div className="grid grid-cols-2 gap-2">
            {allPlayers.map(p => (
              <div key={p.id}
                className={`flex items-center gap-2 bg-card border rounded-xl px-3 py-2 ${p.id === myId ? "border-primary" : "border-border"}`}>
                <span className="text-green-400 text-xs">✓</span>
                <span className="text-sm font-bold truncate">{p.nickname}</span>
                {p.id === myId && <span className="mr-auto text-[10px] text-primary">(أنت)</span>}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">اللعبة ستبدأ عندما يضغط المضيف على ابدأ</p>
      </div>
    );
  }

  // ── QUESTION (answer buttons only, no question text) ─────────────────────
  if ((phase === "question" || phase === "answered") && currentQ) {
    if (phase === "answered") {
      return (
        <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-8 text-center">
          <div className="fade-in-up">
            <div className="w-24 h-24 rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-5xl">✓</span>
            </div>
            <h2 className="text-2xl font-black text-green-400">تم الإجابة!</h2>
            <p className="text-muted-foreground text-sm mt-2">في انتظار بقية اللاعبين...</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-xs">
            <p className="text-xs text-muted-foreground mb-1">اخترت</p>
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="text-3xl">{ANSWER_COLORS[selected!]?.emoji}</span>
              <span className="font-black text-lg">{ANSWER_COLORS[selected!]?.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">نقاطك الحالية</p>
            <p className="text-3xl font-black text-primary mt-1">{myScore}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <div className="rp-medium flex flex-col flex-1 w-full">
        {/* Timer header */}
        <header className="p-4 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-xs text-muted-foreground">سؤال {currentQIdx + 1}/{partyQs.length}</p>
              <p className="text-sm font-black text-primary">{myScore} نقطة</p>
            </div>
            <span className={`text-4xl font-black tabular-nums ${isDanger ? "timer-danger" : "text-primary"}`}>
              {timeLeft}
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 ease-linear"
              style={{
                width: `${timerPct}%`,
                background: isDanger
                  ? "linear-gradient(90deg,#ef4444,#dc2626)"
                  : "linear-gradient(90deg,#7c3aed,#8b5cf6)",
              }} />
          </div>
        </header>

        {/* Question image (always shown if present) + text (optional) */}
        <div className="px-4 py-3 text-center">
          {currentQ?.image_url && (
            <QuestionImage url={currentQ.image_url} maxHeight={150} className="mb-2" />
          )}
          {room?.show_question_on_phone && currentQ ? (
            <div className="bg-card border border-border rounded-xl p-3 mb-2">
              <p className="text-sm font-bold leading-relaxed">{currentQ.question}</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm font-bold">انظر إلى الشاشة الكبيرة واختر إجابتك 👇</p>
          )}
        </div>

        {/* 4 big colored answer buttons */}
        <div className="flex-1 p-4 grid grid-cols-2 gap-4">
          {ANSWER_COLORS.map((color, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={selected !== null}
              className="rounded-2xl flex flex-col items-center justify-center gap-2 text-white font-black text-3xl transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg,${color.bg},${color.dark})`,
                minHeight: "120px",
              }}>
              <span className="text-4xl">{color.emoji}</span>
              <span className="text-2xl">{color.label}</span>
            </button>
          ))}
        </div>
        </div>
      </div>
    );
  }

  // ── REVEAL ───────────────────────────────────────────────────────────────
  if (phase === "reveal" && currentQ) {
    const wasCorrect = selected !== null && selected === currentQ.correct;
    const didAnswer = selected !== null;
    const streakMsg = consecutiveCorrect >= 5 ? "👑 أسطورة!" : consecutiveCorrect >= 3 ? "⚡ لا يُوقف!" : consecutiveCorrect >= 2 ? "🔥 متقد!" : "";
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6 text-center">
        {showStreakBanner && streakMsg && (
          <div className="fixed inset-x-0 top-6 z-50 flex justify-center px-4 pointer-events-none">
            <div className="px-6 py-3 rounded-2xl font-black text-xl text-white shadow-2xl animate-bounce"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
              {streakMsg} {consecutiveCorrect} صح متتالية!
            </div>
          </div>
        )}
        <div className="fade-in-up w-full max-w-sm space-y-4">
          {/* Result indicator */}
          <div className={`rounded-3xl p-6 border-2 ${
            !didAnswer ? "bg-card border-border" :
            wasCorrect ? "bg-green-500/15 border-green-500/50" : "bg-red-500/15 border-red-500/50"
          }`}>
            <p className="text-5xl mb-2">{!didAnswer ? "⏰" : wasCorrect ? "🎉" : "❌"}</p>
            <h2 className={`text-2xl font-black ${wasCorrect ? "text-green-400" : !didAnswer ? "text-muted-foreground" : "text-red-400"}`}>
              {!didAnswer ? "انتهى الوقت!" : wasCorrect ? "إجابة صحيحة!" : "إجابة خاطئة"}
            </h2>
            {roundPoints !== null && roundPoints > 0 && (
              <p className="text-yellow-400 font-black text-xl mt-2">+{roundPoints} نقطة</p>
            )}
            {!wasCorrect && currentQ && (
              <p className="text-muted-foreground text-sm mt-2">
                الإجابة الصحيحة: <span className="font-bold">{ANSWER_COLORS[currentQ.correct]?.emoji} {ANSWER_COLORS[currentQ.correct]?.label}</span>
              </p>
            )}
          </div>

          {/* Current score & rank */}
          <div className="bg-card border border-border rounded-2xl p-4 flex justify-around">
            <div>
              <p className="text-3xl font-black text-primary">{myScore}</p>
              <p className="text-xs text-muted-foreground">نقاطك</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-3xl font-black text-foreground">#{myRank || "-"}</p>
              <p className="text-xs text-muted-foreground">مركزك</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground animate-pulse">جاري عرض الترتيب...</p>
      </div>
    );
  }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-5 text-center">
        <div className="fade-in-up">
          <p className="text-4xl mb-2">🏆</p>
          <h2 className="text-xl font-black text-primary">الترتيب الحالي</h2>
          <p className="text-muted-foreground text-sm mt-1">
            أنت في المركز <span className="font-black text-foreground">#{myRank || "-"}</span>
          </p>
        </div>
        <div className="w-full max-w-sm md:max-w-md space-y-2">
          {sorted.slice(0, 5).map((p, i) => (
            <div key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                p.id === myId ? "border-primary bg-primary/10" :
                i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                "bg-card border-border"
              }`}>
              <span>{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className={`flex-1 font-bold text-sm text-right ${p.id === myId ? "text-primary" : ""}`}>
                {p.nickname}{p.id === myId && " (أنت)"}
              </span>
              <span className="font-black text-primary">{p.score}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground animate-pulse">في انتظار السؤال التالي...</p>
      </div>
    );
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (phase === "finished") {
    const isTop3 = myRank >= 1 && myRank <= 3;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 gap-5 text-center">
        <div className="fade-in-up">
          <p className="text-6xl mb-2">
            {myRank === 1 ? "🏆" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🎮"}
          </p>
          <h1 className="text-2xl font-black text-primary">انتهت اللعبة!</h1>
          <p className="text-muted-foreground text-sm mt-1">
            مركزك النهائي: <span className="font-black text-foreground text-lg">#{myRank || "-"}</span>
          </p>
          <p className="text-primary font-black text-3xl mt-2">{myScore} نقطة</p>
          {isTop3 && (
            <p className="text-yellow-400 font-bold text-sm mt-2 animate-pulse">
              🎉 مبروك! أنت في المنصة!
            </p>
          )}
        </div>

        <div className="w-full max-w-sm md:max-w-md space-y-2">
          {sorted.map((p, i) => (
            <div key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                p.id === myId ? "border-primary bg-primary/10" :
                i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                i === 1 ? "bg-slate-400/10 border-slate-400/20" :
                i === 2 ? "bg-orange-700/10 border-orange-700/20" :
                "bg-card border-border"
              }`}>
              <span className="text-xl">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className={`flex-1 font-bold text-right text-sm ${p.id === myId ? "text-primary" : ""}`}>
                {p.nickname}{p.id === myId && " (أنت)"}
              </span>
              <span className="font-black text-primary">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => navigate("/party/guest")}
            className="px-6 py-3 rounded-xl font-bold text-white text-sm"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            انضم مجدداً
          </button>
          <button onClick={() => navigate("/")}
            className="px-6 py-3 rounded-xl font-bold bg-card border border-border text-foreground text-sm">
            الرئيسية
          </button>
        </div>
      </div>
    );
  }

  return null;
}
