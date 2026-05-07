import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, Question } from "@/lib/questions";
import { shuffleQuestion } from "@/lib/shuffle";
import { fetchSeededQuestions } from "@/lib/questionService";
import { useAuth } from "@/lib/AuthContext";
import { getOrCreateUser } from "@/lib/storage";
import { playCorrect, playWrong, playTick, playGameOver, playMatchFound, playSound } from "@/lib/sound";
import { RANKS, getRankInfo } from "@/lib/rank";
import { getCountryFlag } from "@/lib/countryUtils";
import { recordTodayWin, recordTodayLoss, recordTodayXP } from "@/lib/storage";
import AchievementPopup from "@/components/AchievementPopup";
import FloatingReward from "@/components/FloatingReward";
import ShareCard from "@/components/ShareCard";
import { awardGameRewards, XP_REWARDS, COIN_REWARDS } from "@/lib/gamification";

// ── Types ───────────────────────────────────────────────────────────────────

type Phase =
  | "select_cats"
  | "searching"
  | "matched"
  | "playing"
  | "q_result"
  | "finished"
  | "practice";

interface RankedMatch {
  id: string;
  player1_id: string;
  player1_name: string;
  player2_id: string;
  player2_name: string;
  category: string;
  status: string;
  current_question: number;
  player1_score: number;
  player2_score: number;
  winner_id: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const QUESTION_TIME = 10;
const RESULT_DELAY = 1500;
const MATCH_QUESTIONS = 10;
const SEARCH_TIMEOUT = 60;
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

async function getMatchQuestions(matchId: string, category: string) {
  return fetchSeededQuestions(category, matchId + category, MATCH_QUESTIONS);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RankedMode() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, refreshUser } = useAuth();
  const localUser = getOrCreateUser();

  const myId = dbUser?.id ?? localUser.userId ?? "";
  const myName = dbUser?.username ?? localUser.displayName ?? "لاعب";
  const [myPoints, setMyPoints] = useState(0);

  const [phase, setPhase] = useState<Phase>("select_cats");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [searchTimer, setSearchTimer] = useState(SEARCH_TIMEOUT);
  const [match, setMatch] = useState<RankedMatch | null>(null);
  const [matchQs, setMatchQs] = useState<Question[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [selected, setSelected] = useState<number | null>(null);
  const [qResult, setQResult] = useState<{ p1Ans: number | null; p2Ans: number | null; p1Pts: number; p2Pts: number } | null>(null);
  const [myTotalScore, setMyTotalScore] = useState(0);
  const [oppTotalScore, setOppTotalScore] = useState(0);
  const [answerTime, setAnswerTime] = useState(0);
  const [winner, setWinner] = useState<"me" | "opponent" | "draw" | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [showReward, setShowReward] = useState<{ xp: number; coins: number } | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [rewardSummary, setRewardSummary] = useState<{ xp: number; coins: number; achievements: number } | null>(null);
  const [myCombo, setMyCombo] = useState(0);
  const [oppCombo, setOppCombo] = useState(0);
  const [oppCountry, setOppCountry] = useState<string | null>(null);
  const [oppAvatar, setOppAvatar] = useState<string | null>(null);

  function comboMultiplier(c: number): number {
    if (c >= 10) return 2.5;
    if (c >= 6) return 2;
    if (c >= 3) return 1.5;
    return 1;
  }

  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const matchRef = useRef<RankedMatch | null>(null);
  const myIdRef = useRef(myId);
  const myNameRef = useRef(myName);
  const currentQIdxRef = useRef(0);
  const matchQsRef = useRef<Question[]>([]);
  const phaseRef = useRef<Phase>("select_cats");
  const questionStartRef = useRef(Date.now());

  useEffect(() => {
    myIdRef.current = myId;
    myNameRef.current = myName;
  }, [myId, myName]);

  useEffect(() => {
    loadMyPoints();
    return () => cleanup();
  }, []);

  async function loadMyPoints() {
    const { data } = await supabase
      .from("ranked_queue")
      .select("rank_points")
      .eq("user_id", myId)
      .single();
    if (data) setMyPoints(data.rank_points ?? 0);
  }

  function cleanup() {
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  }

  // ── MATCHMAKING ──────────────────────────────────────────────────────────

  async function enterQueue() {
    if (!myId) return;
    const category = selectedCats.length > 0
      ? selectedCats[Math.floor(Math.random() * selectedCats.length)]
      : "mix";

    // Upsert into ranked_queue
    const { data: existing } = await supabase
      .from("ranked_queue")
      .select("id, rank_points")
      .eq("user_id", myId)
      .single();

    if (existing) {
      await supabase.from("ranked_queue").update({
        username: myName,
        preferred_categories: selectedCats,
        status: "waiting",
        created_at: new Date().toISOString(),
      }).eq("user_id", myId);
    } else {
      await supabase.from("ranked_queue").insert({
        user_id: myId,
        username: myName,
        preferred_categories: selectedCats,
        rank_points: 0,
        status: "waiting",
      });
    }

    phaseRef.current = "searching";
    setPhase("searching");
    setSearchTimer(SEARCH_TIMEOUT);
    startSearching(category);
  }

  function startSearching(category: string) {
    let elapsed = 0;

    // Countdown display
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    searchIntervalRef.current = setInterval(() => {
      elapsed++;
      setSearchTimer(SEARCH_TIMEOUT - elapsed);
      if (elapsed >= SEARCH_TIMEOUT) {
        clearSearchTimers();
        cancelSearch();
      }
    }, 1000);

    // Poll for opponent
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      const found = await findOpponent(category);
      if (found) clearSearchTimers();
    }, 2000);
  }

  function clearSearchTimers() {
    if (searchIntervalRef.current) { clearInterval(searchIntervalRef.current); searchIntervalRef.current = null; }
    if (pollIntervalRef.current)   { clearInterval(pollIntervalRef.current);   pollIntervalRef.current = null; }
  }

  async function findOpponent(category: string): Promise<boolean> {
    if (phaseRef.current !== "searching") return true;

    // Find another waiting player
    const { data: opponents } = await supabase
      .from("ranked_queue")
      .select("*")
      .eq("status", "waiting")
      .neq("user_id", myIdRef.current)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!opponents || opponents.length === 0) return false;
    const opp = opponents[0];

    // Create the match
    const chosenCategory = opp.preferred_categories?.includes(category) ? category : "mix";
    const { data: newMatch, error } = await supabase
      .from("ranked_matches")
      .insert({
        player1_id: myIdRef.current,
        player1_name: myNameRef.current,
        player2_id: opp.user_id,
        player2_name: opp.username,
        category: chosenCategory,
        status: "active",
        current_question: 0,
        player1_score: 0,
        player2_score: 0,
        winner_id: null,
      })
      .select()
      .single();

    if (error || !newMatch) return false;

    // Mark both as matched
    await supabase.from("ranked_queue").update({ status: "matched" }).in("user_id", [myIdRef.current, opp.user_id]);

    await startMatch(newMatch as RankedMatch, "p1");
    return true;
  }

  async function cancelSearch() {
    await supabase.from("ranked_queue").update({ status: "cancelled" }).eq("user_id", myId);
    phaseRef.current = "select_cats";
    setPhase("select_cats");
  }

  // For player2: poll for a match created for them
  useEffect(() => {
    if (phase !== "searching") return;
    const interval = setInterval(async () => {
      if (phaseRef.current !== "searching") { clearInterval(interval); return; }
      const { data } = await supabase
        .from("ranked_matches")
        .select("*")
        .eq("player2_id", myId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        clearInterval(interval);
        await startMatch(data[0] as RankedMatch, "p2");
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [phase, myId]);

  // ── MATCH SETUP ──────────────────────────────────────────────────────────

  async function startMatch(m: RankedMatch, role: "p1" | "p2") {
    clearSearchTimers();
    matchRef.current = m;
    setMatch(m);
    const qs = await getMatchQuestions(m.id, m.category);
    // Deterministic shuffle by q.id so both players see identical option order
    const sq = qs.map((q) => shuffleQuestion(q, q.id));
    matchQsRef.current = sq;
    setMatchQs(sq);
    setMyCombo(0);
    setOppCombo(0);

    // Fetch opponent country/avatar for the in-match scoreboard
    const oppId = role === "p1" ? m.player2_id : m.player1_id;
    if (oppId) {
      supabase.from("users").select("country, avatar_url").eq("id", oppId).single()
        .then(({ data }) => {
          if (data) { setOppCountry(data.country ?? null); setOppAvatar(data.avatar_url ?? null); }
        });
    }

    playMatchFound();
    phaseRef.current = "matched";
    setPhase("matched");

    // Realtime subscription
    const channel = supabase
      .channel("ranked-match:" + m.id)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "ranked_matches",
        filter: `id=eq.${m.id}`,
      }, (payload) => handleMatchUpdate(payload.new as RankedMatch))
      .subscribe();
    channelRef.current = channel;

    // 3-second countdown then start
    let cd = 3;
    setCountdown(cd);
    const cdInterval = setInterval(() => {
      cd--;
      setCountdown(cd);
      if (cd <= 0) {
        clearInterval(cdInterval);
        currentQIdxRef.current = 0;
        setCurrentQIdx(0);
        phaseRef.current = "playing";
        setPhase("playing");
        questionStartRef.current = Date.now();
        startQuestionTimer(0);
      }
    }, 1000);
  }

  function handleMatchUpdate(updated: RankedMatch) {
    matchRef.current = updated;
    setMatch(updated);

    // If question advanced by player1
    if (updated.current_question > currentQIdxRef.current && phaseRef.current === "playing") {
      // Move to next question
      const nextIdx = updated.current_question;
      currentQIdxRef.current = nextIdx;
      setCurrentQIdx(nextIdx);
      if (timerRef.current) clearInterval(timerRef.current);
      setSelected(null);
      setQResult(null);
      phaseRef.current = "playing";
      setPhase("playing");
      questionStartRef.current = Date.now();
      startQuestionTimer(nextIdx);
    }

    if (updated.status === "finished") {
      if (timerRef.current) clearInterval(timerRef.current);
      const isPlayer1 = updated.player1_id === myIdRef.current;
      const myScore = isPlayer1 ? updated.player1_score : updated.player2_score;
      const oppScore = isPlayer1 ? updated.player2_score : updated.player1_score;
      setMyTotalScore(myScore);
      setOppTotalScore(oppScore);
      const w = updated.winner_id === myIdRef.current ? "me" : updated.winner_id ? "opponent" : "draw";
      setWinner(w);
      if (w === "me") playGameOver();
      else if (w === "opponent") playWrong();
      phaseRef.current = "finished";
      setPhase("finished");
    }
  }

  // ── GAME LOGIC ────────────────────────────────────────────────────────────

  function startQuestionTimer(qIdx: number) {
    setTimeLeft(QUESTION_TIME);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 3 && prev > 0) playSound("countdown");
        else if (prev <= 4 && prev > 0) playTick();
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeout(qIdx);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleTimeout(qIdx: number) {
    if (phaseRef.current !== "playing") return;
    await submitAnswer(null, qIdx, 0);
  }

  async function handleAnswer(idx: number, qIdx: number) {
    if (phaseRef.current !== "playing" || selected !== null) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsed = Math.floor((Date.now() - questionStartRef.current) / 1000);
    const pts = Math.max(1, QUESTION_TIME - elapsed);

    const q = matchQsRef.current[qIdx];
    const correct = idx === q?.correct;
    const earnedPts = correct ? pts : 0;

    if (correct) playCorrect();
    else playWrong();

    setSelected(idx);
    setAnswerTime(elapsed + 1);
    await submitAnswer(idx, qIdx, earnedPts);
  }

  async function submitAnswer(ans: number | null, qIdx: number, pts: number) {
    if (!matchRef.current) return;
    const m = matchRef.current;
    const isP1 = m.player1_id === myIdRef.current;
    const field = isP1 ? "player1_score" : "player2_score";
    const newScore = (isP1 ? m.player1_score : m.player2_score) + pts;
    const signalField = "winner_id";

    // Signal our answer
    const signal = isP1 ? `p1:${ans ?? -1}:${qIdx}` : `p2:${ans ?? -1}:${qIdx}`;
    await supabase.from("ranked_matches").update({
      [field]: newScore,
      [signalField]: signal,
    }).eq("id", m.id);

    // Poll for opponent's answer then advance
    waitForBothAndAdvance(qIdx, ans, pts, newScore, isP1);
  }

  async function waitForBothAndAdvance(qIdx: number, myAns: number | null, myPts: number, myNewScore: number, isP1: boolean) {
    phaseRef.current = "q_result";
    // Wait up to 3 seconds for opponent, then advance
    const start = Date.now();
    const interval = setInterval(async () => {
      const { data } = await supabase.from("ranked_matches").select("*").eq("id", matchRef.current!.id).single();
      if (!data) { clearInterval(interval); return; }
      const current = data as RankedMatch;

      const oppSignal = isP1 ? current.winner_id?.startsWith("p2:") : current.winner_id?.startsWith("p1:");
      const oppQSignal = current.winner_id?.endsWith(`:${qIdx}`);
      const bothAnswered = oppSignal && oppQSignal;
      const timedOut = Date.now() - start > 3000;

      if (bothAnswered || timedOut) {
        clearInterval(interval);
        // Parse opponent's answer from signal
        let oppAns: number | null = null;
        let oppPts = 0;
        const parts = current.winner_id?.split(":") ?? [];
        if (parts.length >= 2) {
          const rawAns = parseInt(parts[1]);
          oppAns = rawAns === -1 ? null : rawAns;
          const q = matchQsRef.current[qIdx];
          if (q && oppAns !== null && oppAns === q.correct) {
            // We don't know opp's exact timing so just show their score delta
            const oppField = isP1 ? current.player2_score : current.player1_score;
            const prevOppScore = isP1 ? matchRef.current!.player2_score : matchRef.current!.player1_score;
            oppPts = oppField - prevOppScore;
          }
        }

        const p1Ans = isP1 ? myAns : oppAns;
        const p2Ans = isP1 ? oppAns : myAns;
        const p1Pts = isP1 ? myPts : oppPts;
        const p2Pts = isP1 ? oppPts : myPts;

        setQResult({ p1Ans, p2Ans, p1Pts, p2Pts });
        setMatch(current);
        matchRef.current = current;

        setMyTotalScore(myNewScore);
        setOppTotalScore(isP1 ? current.player2_score : current.player1_score);

        // Update combos based on outcome
        const myPtsThisQ = isP1 ? p1Pts : p2Pts;
        const oppPtsThisQ = isP1 ? p2Pts : p1Pts;
        if (myPtsThisQ > 0) {
          setMyCombo((c) => {
            const next = c + 1;
            if (next === 3 || next === 6 || next === 10) playSound("combo", next);
            return next;
          });
        } else {
          setMyCombo(0);
        }
        setOppCombo((c) => (oppPtsThisQ > 0 ? c + 1 : 0));
        setPhase("q_result");

        // After result delay, advance
        setTimeout(async () => {
          const nextIdx = qIdx + 1;
          if (nextIdx >= MATCH_QUESTIONS) {
            // Game over
            await finishMatch(isP1, current, myNewScore);
          } else {
            // Only player1 advances the question
            if (isP1) {
              await supabase.from("ranked_matches").update({
                current_question: nextIdx,
                winner_id: null,
              }).eq("id", matchRef.current!.id);
            }
            currentQIdxRef.current = nextIdx;
            setCurrentQIdx(nextIdx);
            setSelected(null);
            setQResult(null);
            phaseRef.current = "playing";
            setPhase("playing");
            questionStartRef.current = Date.now();
            startQuestionTimer(nextIdx);
          }
        }, RESULT_DELAY);
      }
    }, 500);
  }

  async function finishMatch(isP1: boolean, current: RankedMatch, myFinalScore: number) {
    const oppFinalScore = isP1 ? current.player2_score : current.player1_score;
    let winnerId: string | null = null;
    if (myFinalScore > oppFinalScore) winnerId = myIdRef.current;
    else if (oppFinalScore > myFinalScore) winnerId = isP1 ? current.player2_id : current.player1_id;

    // Update match
    await supabase.from("ranked_matches").update({
      status: "finished",
      winner_id: winnerId,
    }).eq("id", matchRef.current!.id);

    // Update rank points
    const won = winnerId === myIdRef.current;
    const draw = winnerId === null;
    const delta = won ? 20 : draw ? 0 : -5;
    if (delta !== 0) {
      const { data } = await supabase.from("ranked_queue").select("rank_points").eq("user_id", myIdRef.current).single();
      if (data) {
        const newPts = Math.max(0, (data.rank_points ?? 0) + delta);
        await supabase.from("ranked_queue").update({ rank_points: newPts }).eq("user_id", myIdRef.current);
        setMyPoints(newPts);
      }
    }

    setMyTotalScore(myFinalScore);
    setOppTotalScore(oppFinalScore);
    setWinner(won ? "me" : draw ? "draw" : "opponent");
    if (won) playGameOver();
    else if (!draw) playWrong();
    phaseRef.current = "finished";
    setPhase("finished");

    // Award XP, coins and season points for authenticated users
    if (dbUser?.id) {
      const xpGain    = won ? XP_REWARDS.win_ranked : (draw ? 15 : 5);
      const coinGain  = won ? COIN_REWARDS.win_ranked : 0;
      awardGameRewards({
        userId: dbUser.id,
        xp: xpGain,
        coins: coinGain,
        currentXP: dbUser.xp ?? 0,
        currentCoins: dbUser.coins ?? 0,
        currentLevel: dbUser.level ?? 1,
        currentAchievements: dbUser.achievements,
        currentSeasonPoints: dbUser.season_points ?? 0,
        seasonDelta: won ? 20 : draw ? 5 : 0,
        progressUpdates: {
          total_games:       1,
          total_correct:     myFinalScore,
          ranked_wins:       won ? 1 : 0,
          consecutive_wins:  won ? 1 : 0,
        },
      }).then(result => {
        setShowReward({ xp: result.xpGained, coins: result.coinsGained });
        setRewardSummary({ xp: result.xpGained, coins: result.coinsGained, achievements: result.newlyUnlocked.length });
        if (result.newlyUnlocked.length > 0) {
          setNewAchievements(result.newlyUnlocked);
          playSound("achievement");
        }
        if (result.coinsGained > 0) playSound("coin");
        if (result.leveledUp) playSound("levelup");
        refreshUser();
      }).catch(() => {});
    }

    // Today-stats roll-up (works for guests too)
    if (won) recordTodayWin(); else if (!draw) recordTodayLoss();
    recordTodayXP(won ? XP_REWARDS.win_ranked : (draw ? 15 : 5));
  }

  // ── RENDER ────────────────────────────────────────────────────────────────

  const myRank = getRankInfo(myPoints);
  const currentQ = matchQs[currentQIdx] ?? null;
  const timerPct = (timeLeft / QUESTION_TIME) * 100;
  const isDanger = timeLeft <= 3;
  const isP1 = match?.player1_id === myId;
  const opponentName = isP1 ? match?.player2_name : match?.player1_name;

  // ── SELECT CATEGORIES ────────────────────────────────────────────────────
  if (phase === "select_cats") {
    const cats = [
      { id: "mix", name: "مزيج", icon: "🌐" },
      ...CATEGORIES.filter((c) => !c.isPremium).map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    ];
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground text-xl">←</button>
          <h1 className="text-lg font-black">⚡ تحدي المتصدرين</h1>
          <div className="mr-auto flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1">
            <span>{myRank.icon}</span>
            <span className="text-xs font-bold" style={{ color: myRank.color }}>{myPoints} نقطة</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {isGuest && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-center">
              <p className="text-sm font-bold text-yellow-400">سجّل دخولك لحفظ نقاطك</p>
              <p className="text-xs text-muted-foreground mt-1">يمكنك اللعب كضيف لكن النقاط لن تُحفظ</p>
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="font-bold text-sm text-center">🏆 نظام الرتب</p>
            <div className="grid grid-cols-5 gap-1">
              {RANKS.map((r) => (
                <div key={r.label} className={`text-center p-2 rounded-xl border ${myPoints >= r.min && myPoints <= r.max ? "border-primary bg-primary/10" : "border-border"}`}>
                  <p className="text-xl">{r.icon}</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: r.color }}>{r.label}</p>
                  <p className="text-[9px] text-muted-foreground">{r.min}+</p>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-center">
              فوز: +20 نقطة · خسارة: -5 نقاط
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-bold mb-2">اختر فئاتك المفضلة (اختياري)</p>
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCats(prev =>
                    prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                  )}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selectedCats.includes(c.id) ? "bg-primary text-background border-primary" : "border-border text-muted-foreground"}`}
                >
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">إذا لم تختر، سيكون المزيج</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 text-sm space-y-1.5">
            <p className="font-bold text-center mb-2">⚡ قواعد التحدي</p>
            <p className="text-muted-foreground">• 10 أسئلة · 10 ثوانٍ لكل سؤال</p>
            <p className="text-muted-foreground">• الإجابة أسرع = نقاط أكثر (10→1)</p>
            <p className="text-muted-foreground">• السؤال ينتهي عندما يجيب كلا اللاعبين</p>
            <p className="text-muted-foreground">• انقطاع الخصم = فوز تلقائي بعد 30 ثانية</p>
          </div>
        </div>

        <div className="p-4">
          <button
            onClick={enterQueue}
            className="w-full h-14 rounded-2xl font-black text-background text-lg"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}
          >
            🔍 ابحث عن خصم
          </button>
        </div>
      </div>
    );
  }

  // ── SEARCHING ──────────────────────────────────────────────────────────────
  if (phase === "searching") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-8 text-center">
        <div className="fade-in-up space-y-4">
          <div className="relative w-24 h-24 mx-auto">
            <div className="w-24 h-24 rounded-full border-4 border-secondary/30 border-t-secondary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">⚔️</div>
          </div>
          <h1 className="text-xl font-black text-primary">جاري البحث عن خصم...</h1>
          <p className="text-muted-foreground text-sm">سيبدأ البحث تلقائياً عند إيجاد لاعب</p>
          <div className="flex items-center justify-center gap-1">
            <span className="text-muted-foreground text-sm">⏱️</span>
            <span className="text-xl font-black tabular-nums text-primary">{searchTimer}s</span>
          </div>
        </div>
        <button
          onClick={() => { clearSearchTimers(); cancelSearch(); }}
          className="px-6 py-3 rounded-xl bg-card border border-border text-sm font-bold text-muted-foreground"
        >
          إلغاء البحث
        </button>
      </div>
    );
  }

  // ── MATCHED COUNTDOWN ─────────────────────────────────────────────────────
  if (phase === "matched" && match) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6 text-center">
        <div className="fade-in-up">
          <p className="text-green-400 font-bold text-sm mb-4">✓ وُجد خصم!</p>
          <div className="flex items-center gap-8 mb-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center mx-auto mb-2 text-2xl font-black text-primary">
                {myName.charAt(0)}
              </div>
              <p className="text-sm font-bold">{myName}</p>
              <p className="text-xs text-muted-foreground">أنت</p>
            </div>
            <div className="text-4xl font-black text-muted-foreground">VS</div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-secondary/15 border-2 border-secondary flex items-center justify-center mx-auto mb-2 text-2xl font-black text-secondary">
                {opponentName?.charAt(0) ?? "؟"}
              </div>
              <p className="text-sm font-bold">{opponentName}</p>
              <p className="text-xs text-muted-foreground">الخصم</p>
            </div>
          </div>
          <div className="text-6xl font-black text-primary">{countdown}</div>
          <p className="text-muted-foreground text-sm mt-2">تبدأ اللعبة...</p>
        </div>
      </div>
    );
  }

  // ── PLAYING ───────────────────────────────────────────────────────────────
  if ((phase === "playing" || phase === "q_result") && currentQ && match) {
    const myFlag = dbUser?.country ? getCountryFlag(dbUser.country) : "";
    const oppFlag = oppCountry ? getCountryFlag(oppCountry) : "";
    const myAvatar = dbUser?.avatar_url;
    const myScoreVal = isP1 ? match.player1_score : match.player2_score;
    const oppScoreVal = isP1 ? match.player2_score : match.player1_score;
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-3 border-b border-border/30 space-y-2">
          {/* Both players row */}
          <div className="flex items-center gap-2">
            {/* Me */}
            <div className="flex-1 flex items-center gap-2 bg-card/60 rounded-xl p-2 border border-primary/20">
              {myAvatar ? (
                <img src={myAvatar} alt="" className="w-9 h-9 rounded-full border-2 border-primary object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center text-sm font-black text-primary shrink-0">
                  {myName.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  {myFlag && <span className="text-xs">{myFlag}</span>}
                  <p className="text-[11px] font-bold truncate">{myName}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-black text-primary leading-none">{myScoreVal}</p>
                  {myCombo >= 3 && (
                    <span className="px-1 rounded text-[9px] font-black text-white"
                      style={{ background: myCombo >= 10 ? "#dc2626" : myCombo >= 6 ? "#7c3aed" : "#0ea5e9" }}>
                      🔥{myCombo}×{comboMultiplier(myCombo)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* VS + question counter */}
            <div className="text-center px-1 shrink-0">
              <p className="text-[9px] text-muted-foreground">{currentQIdx + 1}/{MATCH_QUESTIONS}</p>
              <span className={`text-lg font-black tabular-nums ${isDanger && phase === "playing" ? "timer-danger" : "text-foreground"}`}>
                {phase === "q_result" ? "✓" : `${timeLeft}s`}
              </span>
            </div>

            {/* Opponent */}
            <div className="flex-1 flex items-center gap-2 bg-card/60 rounded-xl p-2 border border-secondary/20 flex-row-reverse text-right">
              {oppAvatar ? (
                <img src={oppAvatar} alt="" className="w-9 h-9 rounded-full border-2 border-secondary object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-secondary/15 border-2 border-secondary flex items-center justify-center text-sm font-black text-secondary shrink-0">
                  {opponentName?.charAt(0) ?? "؟"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 flex-row-reverse">
                  {oppFlag && <span className="text-xs">{oppFlag}</span>}
                  <p className="text-[11px] font-bold truncate">{opponentName}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-row-reverse">
                  <p className="text-lg font-black text-secondary leading-none">{oppScoreVal}</p>
                  {oppCombo >= 3 && (
                    <span className="px-1 rounded text-[9px] font-black text-white"
                      style={{ background: oppCombo >= 10 ? "#dc2626" : oppCombo >= 6 ? "#7c3aed" : "#0ea5e9" }}>
                      🔥{oppCombo}×{comboMultiplier(oppCombo)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Timer bar */}
          {phase === "playing" && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${timerPct}%`, background: isDanger ? "#dc2626" : "linear-gradient(90deg,#7c3aed,#8b5cf6)" }} />
            </div>
          )}
        </header>

        <div key={`ranked-${currentQIdx}`} className="flex-1 flex flex-col justify-center p-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-base font-bold leading-relaxed">{currentQ.question}</p>
          </div>

          {phase === "q_result" && qResult && (
            <div className={`py-3 rounded-2xl text-center font-black ${selected === currentQ.correct ? "bg-green-500/20 border border-green-500/40 text-green-400" : "bg-red-500/20 border border-red-500/40 text-red-400"}`}>
              {selected === currentQ.correct
                ? `🎉 صحيح! +${isP1 ? qResult.p1Pts : qResult.p2Pts} نقاط`
                : `❌ خطأ. الإجابة: ${["أ","ب","ج","د"][currentQ.correct]}`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {currentQ.options.map((opt, idx) => {
              let cls = "w-full p-3.5 rounded-xl text-right font-bold text-sm border-2 transition-none";
              if (phase === "q_result") {
                if (idx === currentQ.correct) cls += " border-green-500 bg-green-500/15 text-green-400";
                else if (idx === selected) cls += " border-red-500 bg-red-500/15 text-red-400";
                else cls += " border-border bg-card text-muted-foreground opacity-40";
              } else {
                cls += idx === selected
                  ? " border-primary bg-primary/15 text-primary"
                  : " border-border bg-card text-foreground";
              }
              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx, currentQIdx)}
                  disabled={phase === "q_result" || selected !== null}
                  className={cls}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center font-black shrink-0 text-sm">
                      {["أ","ب","ج","د"][idx]}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {phase === "q_result" && qResult && (
            <div className="bg-card border border-border rounded-xl p-3 flex justify-around text-center">
              <div>
                <p className="text-xs text-muted-foreground">أنت</p>
                <p className="font-black text-primary">+{isP1 ? qResult.p1Pts : qResult.p2Pts}</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">{opponentName}</p>
                <p className="font-black text-secondary">+{isP1 ? qResult.p2Pts : qResult.p1Pts}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── FINISHED ─────────────────────────────────────────────────────────────
  if (phase === "finished") {
    const won = winner === "me";
    const draw = winner === "draw";
    const delta = won ? +20 : draw ? 0 : -5;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 gap-6 text-center">
        {showReward && (
          <FloatingReward xp={showReward.xp} coins={showReward.coins} onDone={() => setShowReward(null)} />
        )}
        {newAchievements.length > 0 && (
          <AchievementPopup unlockedIds={newAchievements} onDone={() => setNewAchievements([])} />
        )}
        <div className="fade-in-up">
          <p className="text-7xl mb-3">{won ? "🏆" : draw ? "🤝" : "😔"}</p>
          <h1 className="text-3xl font-black" style={{ color: won ? "#f59e0b" : draw ? "#94a3b8" : "#ef4444" }}>
            {won ? "فزت!" : draw ? "تعادل!" : "خسرت!"}
          </h1>
        </div>

        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5">
          <div className="flex justify-around">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">أنت</p>
              <p className="text-4xl font-black text-primary">{myTotalScore}</p>
              <p className="text-xs text-muted-foreground">{myName}</p>
            </div>
            <div className="text-3xl font-black text-muted-foreground self-center">vs</div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">الخصم</p>
              <p className="text-4xl font-black text-secondary">{oppTotalScore}</p>
              <p className="text-xs text-muted-foreground">{opponentName}</p>
            </div>
          </div>
        </div>

        <div className={`w-full max-w-sm rounded-2xl p-4 border text-center ${won ? "bg-green-500/10 border-green-500/30" : draw ? "bg-slate-400/10 border-slate-400/30" : "bg-red-500/10 border-red-500/30"}`}>
          <p className="text-sm text-muted-foreground">نقاط الرتبة</p>
          <p className={`text-2xl font-black ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
            {delta > 0 ? "+" : ""}{delta}
          </p>
          <p className="text-xs text-muted-foreground mt-1">المجموع: {myPoints} نقطة · {myRank.icon} {myRank.label}</p>
        </div>

        {/* Reward summary */}
        {!isGuest && (
          <div className="w-full max-w-sm rounded-2xl p-4 border border-yellow-500/20"
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
              <div className="flex justify-center">
                <div className="w-5 h-5 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        <div className="w-full max-w-sm">
          <ShareCard
            playerName={dbUser?.username || getOrCreateUser().displayName || "لاعب ميدان"}
            avatarUrl={dbUser?.avatar_url ?? null}
            countryCode={dbUser?.country ?? null}
            score={isP1 ? match!.player1_score : match!.player2_score}
            total={Math.max((isP1 ? match!.player1_score : match!.player2_score), (isP1 ? match!.player2_score : match!.player1_score), 1)}
            xpEarned={rewardSummary?.xp ?? 0}
            coinsEarned={rewardSummary?.coins ?? 0}
            category="مصنّف"
            level={myRank.label}
            levelIcon={myRank.icon}
            gameMode="ranked"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={() => { cleanup(); setPhase("select_cats"); setMatch(null); setSelected(null); setQResult(null); setCurrentQIdx(0); }}
            className="px-6 py-3 rounded-xl font-bold text-background"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            تحدٍّ جديد
          </button>
          <button onClick={() => navigate("/")} className="px-6 py-3 rounded-xl font-bold bg-card border border-border">
            الرئيسية
          </button>
        </div>
      </div>
    );
  }

  return null;
}
