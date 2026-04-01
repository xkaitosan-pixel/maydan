import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { questions, CATEGORIES, getCategoryById } from "@/lib/questions";
import CategoryCard from "@/components/CategoryCard";
import {
  generateRoomCode, saveRoom, getRoom, getOrCreateUser,
  RoomData, RoomPlayer
} from "@/lib/storage";
import { insertScore } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";

type Phase = "setup" | "lobby" | "turn_intro" | "playing" | "between" | "results";

const QUESTION_TIME = 25;

export default function FriendsRoom() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest } = useAuth();
  const user = getOrCreateUser();

  // Setup
  const [phase, setPhase] = useState<Phase>("setup");
  const [categoryId, setCategoryId] = useState("mix");
  const [questionCount, setQuestionCount] = useState(5);
  const [playerNames, setPlayerNames] = useState<string[]>([user.displayName || "", ""]);
  const [nameInput, setNameInput] = useState("");

  // Room
  const [room, setRoom] = useState<RoomData | null>(null);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [startTime, setStartTime] = useState(0);
  const [playerTimeMs, setPlayerTimeMs] = useState(0);
  const [introCountdown, setIntroCountdown] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── SETUP ──────────────────────────────────────────────────────────────────
  function handleCreateRoom() {
    const validNames = playerNames.map(n => n.trim()).filter(Boolean);
    if (validNames.length < 2) return;

    // pick questions
    const catQuestions = categoryId === "mix"
      ? questions.filter(q => q.category !== "legends")
      : questions.filter(q => q.category === categoryId);
    const shuffled = [...catQuestions].sort(() => Math.random() - 0.5).slice(0, questionCount);

    const code = generateRoomCode();
    const newRoom: RoomData = {
      code,
      categoryId,
      questionCount: shuffled.length,
      questions: shuffled.map(q => q.id),
      players: validNames.map(name => ({ name, score: 0, answers: [], timeMs: 0 })),
      status: "waiting",
      hostName: validNames[0],
      createdAt: new Date().toISOString(),
    };
    saveRoom(newRoom);
    setRoom(newRoom);
    setPhase("lobby");
  }

  function startGame() {
    if (!room) return;
    const updated = { ...room, status: "playing" as const };
    saveRoom(updated);
    setRoom(updated);
    setCurrentPlayerIdx(0);
    beginTurnIntro(updated, 0);
  }

  // ── TURN INTRO ─────────────────────────────────────────────────────────────
  function beginTurnIntro(r: RoomData, playerIdx: number) {
    setCurrentPlayerIdx(playerIdx);
    setCurrentQIdx(0);
    setAnswers([]);
    setIntroCountdown(3);
    setPhase("turn_intro");
  }

  // Guarantee clean visual state on every question change
  useEffect(() => {
    setSelected(null);
    setShowResult(false);
  }, [currentQIdx]);

  useEffect(() => {
    if (phase !== "turn_intro") return;
    if (introCountdown <= 0) {
      setStartTime(Date.now());
      setTimeLeft(QUESTION_TIME);
      setSelected(null);
      setShowResult(false);
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setIntroCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, introCountdown]);

  // ── TIMER ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing" || showResult) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, showResult, currentQIdx]);

  const handleTimeout = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const newAns = [...answers, null];
    setAnswers(newAns);
    setShowResult(true);
    setTimeout(() => advance(newAns), 900);
  }, [answers, currentQIdx, room]);

  function handleAnswer(idx: number) {
    if (selected !== null || showResult || !room) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelected(idx);
    setShowResult(true);
    const newAns = [...answers, idx];
    setAnswers(newAns);
    setTimeout(() => advance(newAns), 900);
  }

  function advance(currentAnswers: (number | null)[]) {
    if (!room) return;
    const nextQIdx = currentQIdx + 1;
    if (nextQIdx < room.questions.length) {
      setCurrentQIdx(nextQIdx);
      setSelected(null);
      setShowResult(false);
      setTimeLeft(QUESTION_TIME);
    } else {
      // Player done — save results
      finishCurrentPlayer(currentAnswers);
    }
  }

  function finishCurrentPlayer(finalAnswers: (number | null)[]) {
    if (!room) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const totalMs = Date.now() - startTime;
    const score = finalAnswers.reduce<number>((acc, ans, i) => {
      const q = questions.find(q => q.id === room.questions[i]);
      return acc + (ans === q?.correct ? 1 : 0);
    }, 0);

    const updatedPlayers = [...room.players];
    updatedPlayers[currentPlayerIdx] = {
      ...updatedPlayers[currentPlayerIdx],
      score,
      answers: finalAnswers,
      timeMs: totalMs,
    };
    const updatedRoom = { ...room, players: updatedPlayers };
    saveRoom(updatedRoom);
    setRoom(updatedRoom);
    setPlayerTimeMs(totalMs);

    // Save this player's score to the leaderboard (authenticated users only)
    if (isGuest) { setPhase("between"); return; }
    const player = room.players[currentPlayerIdx];
    const isCurrentUser = player.name === (dbUser?.username ?? user.displayName);
    insertScore({
      user_id: isCurrentUser ? (dbUser?.id ?? null) : null,
      username: player.name || "لاعب",
      category: room.categoryId,
      score,
      game_mode: "room",
    });

    setPhase("between");
  }

  function nextPlayer() {
    if (!room) return;
    const nextIdx = currentPlayerIdx + 1;
    if (nextIdx < room.players.length) {
      beginTurnIntro(room, nextIdx);
    } else {
      // All done
      const finalRoom = { ...room, status: "done" as const };
      saveRoom(finalRoom);
      setRoom(finalRoom);
      setPhase("results");
    }
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const cat = room ? getCategoryById(room.categoryId) : getCategoryById(categoryId);
  const currentQ = room && phase === "playing" ? questions.find(q => q.id === room.questions[currentQIdx]) : null;
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const isDanger = timeLeft <= 7;

  const sortedPlayers = room ? [...room.players].sort((a, b) => b.score - a.score || a.timeMs - b.timeMs) : [];
  const MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

  // ── PHASES ─────────────────────────────────────────────────────────────────

  if (phase === "setup") {
    const validCats = [
      { id: "mix", name: "مزيج كل الفئات", icon: "🎲", gFrom: "#9333ea", gTo: "#ec4899" },
      ...CATEGORIES.filter(c => !c.isPremium).map(c => ({ id: c.id, name: c.name, icon: c.icon, gFrom: c.gradientFrom, gTo: c.gradientTo })),
    ];

    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">👥 غرفة الأصدقاء</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-8">
          {/* Players */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="font-bold mb-3 text-sm">👥 أسماء اللاعبين (2-8)</p>
            <div className="space-y-2 mb-3">
              {playerNames.map((n, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-lg">{MEDALS[i]}</span>
                  <input
                    className="flex-1 p-2.5 rounded-xl border border-border bg-background text-foreground text-right text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    placeholder={`اللاعب ${i + 1}...`}
                    value={n}
                    onChange={e => {
                      const updated = [...playerNames];
                      updated[i] = e.target.value;
                      setPlayerNames(updated);
                    }}
                    maxLength={15}
                  />
                  {playerNames.length > 2 && (
                    <button onClick={() => setPlayerNames(playerNames.filter((_, j) => j !== i))} className="text-destructive text-sm px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
            {playerNames.length < 8 && (
              <button
                onClick={() => setPlayerNames([...playerNames, ""])}
                className="w-full border border-dashed border-border text-muted-foreground rounded-xl py-2 text-sm hover:border-primary hover:text-primary transition-colors"
              >
                + إضافة لاعب
              </button>
            )}
          </div>

          {/* Category */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-semibold">الفئة</p>
            <div className="grid grid-cols-2 gap-2">
              {validCats.slice(0, 6).map(c => (
                <CategoryCard
                  key={c.id}
                  cat={c as any}
                  isSelected={categoryId === c.id}
                  questionCount={c.id === "mix" ? 225 : 15}
                  onClick={() => setCategoryId(c.id)}
                  size="small"
                />
              ))}
            </div>
            <select
              className="w-full mt-2 p-2.5 rounded-xl border border-border bg-card text-foreground text-right text-sm"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              {validCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          {/* Question count */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-semibold">عدد الأسئلة لكل لاعب</p>
            <div className="flex gap-2">
              {[5, 10, 15].map(n => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border"
                  style={{
                    background: questionCount === n ? "linear-gradient(135deg,#d97706,#f59e0b)" : "",
                    color: questionCount === n ? "black" : "",
                    borderColor: questionCount === n ? "#d97706" : "hsl(var(--border))",
                  }}
                >
                  {n} سؤال
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={playerNames.filter(n => n.trim()).length < 2}
            className="w-full h-14 rounded-xl text-white font-black text-lg disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}
          >
            🎮 إنشاء الغرفة
          </button>
        </div>
      </div>
    );
  }

  if (phase === "lobby" && room) {
    const shareText = `🎮 انضم إلى غرفتي في ميدان!\nرمز الغرفة: ${room.code}\nالفئة: ${cat?.name || "مزيج"}\nعدد الأسئلة: ${room.questionCount}\n${window.location.href.split("/room")[0]}`;
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => setPhase("setup")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">👥 الغرفة جاهزة!</h1>
        </header>
        <div className="flex-1 p-4 space-y-4">
          {/* Room code */}
          <div className="bg-card border border-primary/30 rounded-2xl p-6 text-center">
            <p className="text-xs text-muted-foreground mb-2">رمز الغرفة</p>
            <p className="text-4xl font-black text-primary tracking-wider mb-1" dir="ltr">{room.code}</p>
            <p className="text-xs text-muted-foreground">شارك هذا الرمز مع أصدقائك</p>
          </div>

          {/* Players */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="font-bold mb-3 text-sm">اللاعبون ({room.players.length})</p>
            <div className="space-y-2">
              {room.players.map((p, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 px-3 bg-background rounded-xl">
                  <span>{MEDALS[i]}</span>
                  <span className="font-medium text-sm">{p.name}</span>
                  {i === 0 && <span className="mr-auto text-xs text-primary font-bold">المضيف</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl mb-1">{cat?.icon || "🎲"}</p>
              <p className="font-bold text-xs">{cat?.name || "مزيج"}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-primary mb-1">{room.questionCount}</p>
              <p className="text-xs text-muted-foreground">سؤال لكل لاعب</p>
            </div>
          </div>

          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
            className="w-full h-11 rounded-xl text-white font-bold flex items-center justify-center gap-2 text-sm"
            style={{ backgroundColor: "#25D366" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            مشاركة رمز الغرفة
          </button>

          <button
            onClick={startGame}
            className="w-full h-14 rounded-xl text-white font-black text-lg"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}
          >
            🚀 ابدأ اللعبة
          </button>
          <p className="text-center text-xs text-muted-foreground">مرر الهاتف لكل لاعب ليجيب على الأسئلة</p>
        </div>
      </div>
    );
  }

  if (phase === "turn_intro" && room) {
    const player = room.players[currentPlayerIdx];
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 text-center">
        <div className="fade-in-up space-y-6">
          <div className="text-6xl animate-bounce">{MEDALS[currentPlayerIdx]}</div>
          <div>
            <p className="text-muted-foreground text-sm mb-2">دور</p>
            <p className="text-4xl font-black text-primary">{player.name}</p>
          </div>
          <p className="text-muted-foreground text-sm">مرر الهاتف لهذا اللاعب</p>
          <div className="w-20 h-20 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center mx-auto">
            <span className="text-4xl font-black text-primary">{introCountdown}</span>
          </div>
          <p className="text-xs text-muted-foreground">تبدأ اللعبة تلقائياً...</p>
        </div>
      </div>
    );
  }

  if (phase === "playing" && currentQ && room) {
    const player = room.players[currentPlayerIdx];
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span>{MEDALS[currentPlayerIdx]}</span>
              <span className="text-sm font-bold">{player.name}</span>
            </div>
            <span className={`text-2xl font-black tabular-nums ${isDanger ? "timer-danger" : "text-primary"}`}>{timeLeft}s</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${timerPct}%`, background: isDanger ? "#dc2626" : `linear-gradient(90deg,${cat?.gradientFrom || "#d97706"},${cat?.gradientTo || "#f59e0b"})` }} />
          </div>
          <p className="text-center text-xs text-muted-foreground mt-1">السؤال {currentQIdx + 1} / {room.questions.length}</p>
        </header>
        <div key={`${currentPlayerIdx}-${currentQIdx}`} className="flex-1 flex flex-col justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 mb-4 text-center slide-in">
            <p className="text-lg font-bold leading-relaxed">{currentQ.question}</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {currentQ.options.map((opt, idx) => {
              let cls = "option-btn w-full p-4 rounded-xl text-right font-medium text-sm bg-card";
              if (showResult) {
                if (idx === currentQ.correct) cls += " correct";
                else if (idx === selected) cls += " wrong";
              }
              return (
                <button key={`${currentQ.id}-${idx}`} onClick={() => handleAnswer(idx)} disabled={showResult} className={cls}>
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">{["أ","ب","ج","د"][idx]}</span>
                    <span className="flex-1">{opt}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "between" && room) {
    const player = room.players[currentPlayerIdx];
    const isLast = currentPlayerIdx === room.players.length - 1;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm fade-in-up space-y-4">
          <div className="text-5xl">{MEDALS[currentPlayerIdx]}</div>
          <p className="text-3xl font-black text-primary">{player.score}</p>
          <p className="text-muted-foreground text-sm">نقاط <span className="text-foreground font-bold">{player.name}</span></p>
          {/* Mini leaderboard */}
          <div className="bg-card border border-border rounded-2xl p-4 text-right">
            <p className="text-xs text-muted-foreground text-center mb-3">النتائج حتى الآن</p>
            {room.players
              .filter((p, i) => i <= currentPlayerIdx)
              .sort((a, b) => b.score - a.score)
              .map((p, rank) => (
                <div key={p.name} className="flex items-center gap-2 py-1.5">
                  <span className="text-sm">{MEDALS[rank]}</span>
                  <span className="text-sm flex-1">{p.name}</span>
                  <span className="font-black text-primary">{p.score}</span>
                </div>
              ))}
            {room.players.filter((_, i) => i > currentPlayerIdx).map(p => (
              <div key={p.name} className="flex items-center gap-2 py-1.5 opacity-40">
                <span className="text-sm">⏳</span>
                <span className="text-sm flex-1">{p.name}</span>
                <span className="text-sm text-muted-foreground">لم يلعب</span>
              </div>
            ))}
          </div>
          <button
            onClick={nextPlayer}
            className="w-full h-13 py-3.5 rounded-xl text-white font-black text-base"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}
          >
            {isLast ? "🏆 عرض النتائج النهائية" : `👉 دور ${room.players[currentPlayerIdx + 1]?.name}`}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "results" && room) {
    const winner = sortedPlayers[0];
    const shareText = `🏆 نتائج غرفة الأصدقاء في ميدان!\n${sortedPlayers.map((p, i) => `${MEDALS[i]} ${p.name}: ${p.score} نقطة`).join("\n")}\nالفائز: 👑 ${winner.name}\nالعب معنا: ${window.location.origin}`;

    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 text-center border-b border-border/30">
          <h1 className="text-xl font-black text-primary">🏆 النتائج النهائية</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
          {/* Winner */}
          <div className="text-center py-6 bg-yellow-500/10 border border-yellow-500/25 rounded-2xl fade-in-up">
            <div className="text-6xl animate-bounce mb-3">👑</div>
            <p className="text-xs text-muted-foreground mb-1">سيد الميدان</p>
            <p className="text-3xl font-black text-yellow-400">{winner.name}</p>
            <p className="text-lg font-bold text-muted-foreground mt-1">{winner.score} نقطة</p>
          </div>

          {/* Full leaderboard */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            {sortedPlayers.map((p, rank) => (
              <div key={p.name} className={`flex items-center gap-3 p-3 rounded-xl ${rank === 0 ? "bg-yellow-500/10" : "bg-background"}`}>
                <span className="text-2xl">{MEDALS[rank]}</span>
                <span className="text-sm font-bold flex-1">{p.name}</span>
                <div className="text-right">
                  <p className="font-black text-primary">{p.score}</p>
                  <p className="text-xs text-muted-foreground">{(p.timeMs / 1000).toFixed(1)}s</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
            className="w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2"
            style={{ backgroundColor: "#25D366" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            مشاركة النتائج
          </button>
          <div className="flex gap-3">
            <button onClick={() => { setPhase("setup"); setRoom(null); }} className="flex-1 h-12 rounded-xl font-bold text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
              🔄 غرفة جديدة
            </button>
            <button onClick={() => navigate("/")} className="flex-1 h-12 rounded-xl border border-border text-foreground font-bold bg-card">
              🏠 الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
