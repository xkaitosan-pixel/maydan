import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { questions, CATEGORIES, getCategoryById } from "@/lib/questions";

type Phase = "setup" | "bracket" | "turn_intro" | "playing" | "match_result" | "champion";

interface TPlayer { name: string; }
interface Match { p1: string; p2: string; winner?: string; score1?: number; score2?: number; }
interface Round { matches: Match[]; label: string; }

const MATCH_QUESTIONS = 5;
const QUESTION_TIME = 25;
const MEDALS = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣"];

function buildBracket(names: string[]): Round[] {
  const n = names.length;
  const size = n <= 4 ? 4 : 8;
  const padded = [...names];
  while (padded.length < size) padded.push("");
  const shuffled = [...padded].sort(() => Math.random() - 0.5);

  const rounds: Round[] = [];
  let current = shuffled;

  const labels: Record<number, string> = { 2: "النهائي", 4: "نصف النهائي", 8: "ربع النهائي" };
  let first = true;
  while (current.length > 1) {
    const label = labels[current.length] || `الجولة`;
    const matches: Match[] = [];
    for (let i = 0; i < current.length; i += 2) {
      matches.push({ p1: current[i], p2: current[i + 1] });
    }
    rounds.push({ matches: first ? matches : [], label });
    current = new Array(matches.length).fill("");
    first = false;
  }
  // Fill first round only, rest are placeholders
  return rounds;
}

export default function Tournament() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("setup");
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", "", ""]);
  const [categoryId, setCategoryId] = useState("mix");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [playingFor, setPlayingFor] = useState<"p1" | "p2">("p1");
  const [matchQuestions, setMatchQuestions] = useState<number[]>([]);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [introCountdown, setIntroCountdown] = useState(3);
  const [champion, setChampion] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cat = getCategoryById(categoryId);

  // ── SETUP ──
  function startTournament() {
    const valid = playerNames.map(n => n.trim()).filter(Boolean);
    if (valid.length < 2) return;
    const r = buildBracket(valid);
    setRounds(r);
    setCurrentRound(0);
    setCurrentMatch(0);
    setPhase("bracket");
  }

  // ── BRACKET ──
  function startNextMatch() {
    if (!rounds[currentRound]) return;
    const match = rounds[currentRound].matches[currentMatch];
    if (!match) return;
    // pick questions
    const pool = categoryId === "mix"
      ? questions.filter(q => q.category !== "legends")
      : questions.filter(q => q.category === categoryId);
    const qs = [...pool].sort(() => Math.random() - 0.5).slice(0, MATCH_QUESTIONS).map(q => q.id);
    setMatchQuestions(qs);
    setP1Score(0);
    setP2Score(0);
    setPlayingFor("p1");
    setCurrentQIdx(0);
    setAnswers([]);
    setSelected(null);
    setShowResult(false);
    setIntroCountdown(3);
    setPhase("turn_intro");
  }

  // Guarantee clean visual state on every question change
  useEffect(() => {
    setSelected(null);
    setShowResult(false);
  }, [currentQIdx, playingFor]);

  // ── INTRO ──
  useEffect(() => {
    if (phase !== "turn_intro") return;
    if (introCountdown <= 0) {
      setTimeLeft(QUESTION_TIME);
      setSelected(null);
      setShowResult(false);
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setIntroCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, introCountdown]);

  // ── TIMER ──
  useEffect(() => {
    if (phase !== "playing" || showResult) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); handleTimeout(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, showResult, currentQIdx, playingFor]);

  const handleTimeout = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowResult(true);
    const newAns = [...answers, null];
    setAnswers(newAns);
    setTimeout(() => advanceQ(newAns), 900);
  }, [answers, currentQIdx]);

  function handleAnswer(idx: number) {
    if (selected !== null || showResult) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelected(idx);
    setShowResult(true);
    const newAns = [...answers, idx];
    setAnswers(newAns);
    setTimeout(() => advanceQ(newAns), 900);
  }

  function advanceQ(ans: (number | null)[]) {
    const nextIdx = currentQIdx + 1;
    if (nextIdx < MATCH_QUESTIONS) {
      setCurrentQIdx(nextIdx);
      setSelected(null);
      setShowResult(false);
      setTimeLeft(QUESTION_TIME);
    } else {
      // Count score for current player
      const score = ans.reduce((acc, a, i) => {
        const q = questions.find(q => q.id === matchQuestions[i]);
        return acc + (a === q?.correct ? 1 : 0);
      }, 0);
      if (playingFor === "p1") {
        setP1Score(score);
        setPlayingFor("p2");
        setCurrentQIdx(0);
        setAnswers([]);
        setSelected(null);
        setShowResult(false);
        setIntroCountdown(3);
        setPhase("turn_intro");
      } else {
        setP2Score(score);
        resolveMatch(p1Score, score);
      }
    }
  }

  function resolveMatch(s1: number, s2: number) {
    const match = rounds[currentRound].matches[currentMatch];
    let winner: string;
    if (s1 > s2) winner = match.p1;
    else if (s2 > s1) winner = match.p2;
    else winner = Math.random() < 0.5 ? match.p1 : match.p2; // tiebreak

    const newRounds = rounds.map((r, ri) => {
      if (ri !== currentRound) return r;
      return {
        ...r,
        matches: r.matches.map((m, mi) => mi === currentMatch ? { ...m, winner, score1: s1, score2: s2 } : m),
      };
    });

    // Advance winner to next round
    const winners = newRounds[currentRound].matches.map(m => m.winner || "");
    if (newRounds[currentRound + 1]) {
      const nextRound = { ...newRounds[currentRound + 1] };
      nextRound.matches = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextRound.matches.push({ p1: winners[i] || "", p2: winners[i + 1] || "" });
      }
      newRounds[currentRound + 1] = nextRound;
    }
    setRounds(newRounds);
    setPhase("match_result");
  }

  function afterMatchResult() {
    const roundMatches = rounds[currentRound].matches;
    const nextMatchIdx = currentMatch + 1;
    if (nextMatchIdx < roundMatches.length) {
      setCurrentMatch(nextMatchIdx);
      setPhase("bracket");
    } else {
      // Next round
      const nextRoundIdx = currentRound + 1;
      if (nextRoundIdx < rounds.length) {
        setCurrentRound(nextRoundIdx);
        setCurrentMatch(0);
        setPhase("bracket");
      } else {
        // Champion!
        const champ = rounds[currentRound].matches[currentMatch].winner || "";
        setChampion(champ);
        setPhase("champion");
      }
    }
  }

  const currentQ = phase === "playing" && matchQuestions[currentQIdx]
    ? questions.find(q => q.id === matchQuestions[currentQIdx])
    : null;
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const isDanger = timeLeft <= 7;
  const match = rounds[currentRound]?.matches[currentMatch];
  const currentPlayerName = match ? (playingFor === "p1" ? match.p1 : match.p2) : "";

  // ── RENDER PHASES ──

  if (phase === "setup") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">🏆 بطولة ميدان</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-8">
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="font-bold text-sm mb-3">أسماء اللاعبين (2-8)</p>
            <div className="space-y-2 mb-3">
              {playerNames.map((n, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span>{MEDALS[i]}</span>
                  <input
                    className="flex-1 p-2.5 rounded-xl border border-border bg-background text-foreground text-right text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    placeholder={`اللاعب ${i + 1}`}
                    value={n}
                    onChange={e => { const u = [...playerNames]; u[i] = e.target.value; setPlayerNames(u); }}
                    maxLength={15}
                  />
                  {playerNames.length > 2 && (
                    <button onClick={() => setPlayerNames(playerNames.filter((_, j) => j !== i))} className="text-destructive text-sm px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
            {playerNames.length < 8 && (
              <button onClick={() => setPlayerNames([...playerNames, ""])} className="w-full border border-dashed border-border text-muted-foreground rounded-xl py-2 text-sm hover:border-primary hover:text-primary transition-colors">
                + إضافة لاعب
              </button>
            )}
          </div>
          {/* Category */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-semibold">الفئة</p>
            <select className="w-full p-2.5 rounded-xl border border-border bg-card text-foreground text-right text-sm" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="mix">🎲 مزيج كل الفئات</option>
              {CATEGORIES.filter(c => !c.isPremium).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 text-sm space-y-1">
            <p className="font-bold text-yellow-400 mb-2">🏆 قواعد البطولة</p>
            <p className="text-muted-foreground">⚔️ إقصاء مباشر — الخسارة = خروج</p>
            <p className="text-muted-foreground">🎯 كل مباراة: {MATCH_QUESTIONS} أسئلة</p>
            <p className="text-muted-foreground">👑 البطل الأخير يُلقَّب "سيد الميدان"</p>
          </div>
          <button
            onClick={startTournament}
            disabled={playerNames.filter(n => n.trim()).length < 2}
            className="w-full h-14 rounded-xl text-white font-black text-lg disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            🏆 ابدأ البطولة
          </button>
        </div>
      </div>
    );
  }

  if (phase === "bracket" && match) {
    const roundLabel = rounds[currentRound]?.label || "الجولة";
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 text-center border-b border-border/30">
          <p className="text-xs text-muted-foreground mb-1">{roundLabel}</p>
          <h1 className="text-xl font-black text-primary">مباراة {currentMatch + 1}</h1>
        </header>
        <div className="flex-1 p-4 space-y-4">
          {/* VS card */}
          <div className="bg-card border border-primary/30 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-4">
              <div className="flex-1 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center text-2xl font-black text-primary mx-auto mb-2">
                  {match.p1.charAt(0)}
                </div>
                <p className="font-bold text-sm">{match.p1 || "—"}</p>
              </div>
              <div className="text-3xl font-black text-muted-foreground">VS</div>
              <div className="flex-1 text-center">
                <div className="w-14 h-14 rounded-full bg-secondary/10 border-2 border-secondary flex items-center justify-center text-2xl font-black text-secondary mx-auto mb-2">
                  {match.p2?.charAt(0) || "؟"}
                </div>
                <p className="font-bold text-sm">{match.p2 || "—"}</p>
              </div>
            </div>
          </div>

          {/* Bracket overview */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground text-center mb-3">حالة البطولة</p>
            {rounds.map((r, ri) => (
              <div key={ri} className={`mb-3 ${ri > currentRound ? "opacity-30" : ""}`}>
                <p className="text-xs font-bold text-muted-foreground mb-1.5">{r.label}</p>
                <div className="space-y-1">
                  {r.matches.map((m, mi) => (
                    <div key={mi} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${ri === currentRound && mi === currentMatch ? "bg-primary/10 border border-primary/30" : "bg-background"}`}>
                      <span className={m.winner === m.p1 ? "font-black text-primary" : ""}>{m.p1 || "—"}</span>
                      <span className="text-muted-foreground mx-1">⚔️</span>
                      <span className={m.winner === m.p2 ? "font-black text-primary" : ""}>{m.p2 || "—"}</span>
                      {m.winner && <span className="mr-auto text-yellow-400">→ {m.winner} {m.score1 !== undefined ? `(${m.score1}-${m.score2})` : ""}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={startNextMatch}
            disabled={!match.p1 || !match.p2}
            className="w-full h-14 rounded-xl text-white font-black text-lg disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            ⚔️ ابدأ المباراة
          </button>
        </div>
      </div>
    );
  }

  if (phase === "turn_intro" && match) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 text-center">
        <div className="fade-in-up space-y-6">
          <div className="text-5xl animate-bounce">{playingFor === "p1" ? "🎯" : "⚔️"}</div>
          <p className="text-muted-foreground text-sm">دور</p>
          <p className="text-4xl font-black text-primary">{currentPlayerName}</p>
          <p className="text-muted-foreground text-sm">مرر الهاتف لهذا اللاعب</p>
          <div className="w-20 h-20 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center mx-auto">
            <span className="text-4xl font-black text-primary">{introCountdown}</span>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "playing" && currentQ) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 border-b border-border/30">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold">{currentPlayerName}</span>
            <span className={`text-2xl font-black tabular-nums ${isDanger ? "timer-danger" : "text-primary"}`}>{timeLeft}s</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${timerPct}%`, background: isDanger ? "#dc2626" : `linear-gradient(90deg,${cat?.gradientFrom || "#d97706"},${cat?.gradientTo || "#f59e0b"})` }} />
          </div>
          <p className="text-center text-xs text-muted-foreground mt-1">السؤال {currentQIdx + 1} / {MATCH_QUESTIONS}</p>
        </header>
        <div className="flex-1 flex flex-col justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 mb-4 text-center slide-in">
            <p className="text-lg font-bold leading-relaxed">{currentQ.question}</p>
          </div>
          <div key={currentQ.id} className="grid grid-cols-1 gap-3">
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

  if (phase === "match_result" && match) {
    const winner = match.winner;
    const s1 = match.score1 ?? 0;
    const s2 = match.score2 ?? 0;
    const isFinal = currentRound === rounds.length - 1;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm fade-in-up space-y-5">
          <div className="text-6xl animate-bounce">🏆</div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">الفائز</p>
            <p className="text-3xl font-black text-yellow-400">{winner}</p>
            <p className="text-muted-foreground text-sm mt-1">يتأهل للجولة التالية!</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex justify-around">
              <div className={`text-center ${winner === match.p1 ? "text-yellow-400" : "text-muted-foreground"}`}>
                <p className="text-3xl font-black">{s1}</p>
                <p className="text-sm font-bold mt-1">{match.p1}</p>
                {winner === match.p1 && <p className="text-xs text-yellow-400 mt-1">متأهل ✓</p>}
              </div>
              <div className="text-2xl font-black text-muted-foreground self-center">—</div>
              <div className={`text-center ${winner === match.p2 ? "text-yellow-400" : "text-muted-foreground"}`}>
                <p className="text-3xl font-black">{s2}</p>
                <p className="text-sm font-bold mt-1">{match.p2}</p>
                {winner === match.p2 && <p className="text-xs text-yellow-400 mt-1">متأهل ✓</p>}
              </div>
            </div>
          </div>
          <button
            onClick={afterMatchResult}
            className="w-full h-14 rounded-xl text-white font-black text-base"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            {isFinal && currentMatch === rounds[currentRound].matches.length - 1 ? "👑 اعلن البطل" : "➡️ المباراة التالية"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "champion") {
    const shareText = `🏆 أنا ${champion} بطل بطولة ميدان!\n"سيد الميدان 👑"\nتحدّني في ميدان: ${window.location.origin}`;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm fade-in-up space-y-6">
          <div className="text-8xl animate-bounce">🏆</div>
          <div className="bg-yellow-500/10 border-2 border-yellow-500/40 rounded-3xl p-8">
            <p className="text-xs text-muted-foreground mb-2">سيد الميدان</p>
            <p className="text-4xl font-black text-yellow-400">👑 {champion}</p>
            <p className="text-muted-foreground text-sm mt-3">بطل البطولة بلا منازع!</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-center gap-2">
              {["🏆","🎉","⭐","🌟","✨"].map((e, i) => (
                <span key={i} className="text-2xl animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}>{e}</span>
              ))}
            </div>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
              className="w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: "#25D366" }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              شارك النتيجة
            </button>
            <div className="flex gap-3">
              <button onClick={() => { setPhase("setup"); setChampion(""); setRounds([]); }} className="flex-1 h-12 rounded-xl font-bold text-white" style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
                🔄 بطولة جديدة
              </button>
              <button onClick={() => navigate("/")} className="flex-1 h-12 rounded-xl border border-border text-foreground font-bold bg-card">
                🏠 الرئيسية
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
