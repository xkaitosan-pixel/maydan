import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, Question } from "@/lib/questions";
import CircularTimer from "@/components/CircularTimer";
import { shuffleQuestion } from "@/lib/shuffle";
import { fetchSeededQuestions } from "@/lib/questionService";
import { useAuth } from "@/lib/AuthContext";
import { getOrCreateUser, canPlayRanked, getRemainingRanked, incrementRankedCount } from "@/lib/storage";
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
  | "scoreboard"
  | "finished";

type AnswerEntry = { ans: number | null; pts: number; ms: number };

interface RankedMatch {
  id: string;
  player1_id: string;
  player1_name: string;
  player2_id: string;
  player2_name: string;
  category: string;
  status: string;
  current_question_index: number;
  question_start_time: number | null;
  countdown_start: number | null;
  player1_score: number;
  player2_score: number;
  player1_answers: AnswerEntry[];
  player2_answers: AnswerEntry[];
  winner_id: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const QUESTION_TIME_MS = 10000;
const COUNTDOWN_MS = 3000;
const SCOREBOARD_MS = 2500;
const MATCH_QUESTIONS = 10;
const SEARCH_TIMEOUT = 60;
const POLL_MS = 500;

// Speed → points: 1–2s=10, 3–4s=8, 5–6s=6, 7–8s=4, 9–10s=2 (per spec)
function pointsForElapsedMs(elapsedMs: number, correct: boolean): number {
  if (!correct) return 0;
  const s = Math.max(1, Math.min(10, Math.ceil(elapsedMs / 1000)));
  if (s <= 2) return 10;
  if (s <= 4) return 8;
  if (s <= 6) return 6;
  if (s <= 8) return 4;
  return 2;
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
  const [timeLeft, setTimeLeft] = useState(10);
  const [selected, setSelected] = useState<number | null>(null);
  const [qResult, setQResult] = useState<{ p1Pts: number; p2Pts: number } | null>(null);
  const [myTotalScore, setMyTotalScore] = useState(0);
  const [oppTotalScore, setOppTotalScore] = useState(0);
  const [winner, setWinner] = useState<"me" | "opponent" | "draw" | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [showReward, setShowReward] = useState<{ xp: number; coins: number } | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [rewardSummary, setRewardSummary] = useState<{ xp: number; coins: number; achievements: number } | null>(null);
  const [oppCountry, setOppCountry] = useState<string | null>(null);
  const [oppAvatar, setOppAvatar] = useState<string | null>(null);

  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollSearchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollMatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchRef = useRef<RankedMatch | null>(null);
  const myIdRef = useRef(myId);
  const myNameRef = useRef(myName);
  const phaseRef = useRef<Phase>("select_cats");
  const matchQsRef = useRef<Question[]>([]);
  const submittedQRef = useRef<number>(-1);     // last qIdx for which I already wrote my answer
  const advancedFromRef = useRef<number>(-1);   // last qIdx that p1 already advanced past
  const displayedQIdxRef = useRef<number>(-1);  // qIdx currently shown to the user
  const finishedRef = useRef(false);

  useEffect(() => {
    myIdRef.current = myId;
    myNameRef.current = myName;
  }, [myId, myName]);

  useEffect(() => {
    loadMyPoints();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMyPoints() {
    if (!myId) return;
    const { data } = await supabase
      .from("ranked_queue")
      .select("rank_points")
      .eq("user_id", myId)
      .maybeSingle();
    if (data) setMyPoints(data.rank_points ?? 0);
  }

  function setPhaseSafe(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function cleanup() {
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    if (pollSearchRef.current) clearInterval(pollSearchRef.current);
    if (pollMatchRef.current) clearInterval(pollMatchRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    searchIntervalRef.current = null;
    pollSearchRef.current = null;
    pollMatchRef.current = null;
    timerRef.current = null;
  }

  // ── MATCHMAKING ──────────────────────────────────────────────────────────

  async function enterQueue() {
    if (!myId) return;
    if (!canPlayRanked()) {
      alert("لقد استنفدت جولاتك المصنّفة اليوم (5/يوم). ترقّ إلى ميدان برو لجولات غير محدودة.");
      navigate("/premium");
      return;
    }
    incrementRankedCount();
    const category = selectedCats.length > 0
      ? selectedCats[Math.floor(Math.random() * selectedCats.length)]
      : "mix";

    const { data: existing } = await supabase
      .from("ranked_queue")
      .select("id, rank_points")
      .eq("user_id", myId)
      .maybeSingle();

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

    setPhaseSafe("searching");
    setSearchTimer(SEARCH_TIMEOUT);
    startSearching(category);
  }

  function startSearching(category: string) {
    let elapsed = 0;
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    searchIntervalRef.current = setInterval(() => {
      elapsed++;
      setSearchTimer(SEARCH_TIMEOUT - elapsed);
      if (elapsed >= SEARCH_TIMEOUT) {
        clearSearchTimers();
        cancelSearch();
      }
    }, 1000);

    if (pollSearchRef.current) clearInterval(pollSearchRef.current);
    pollSearchRef.current = setInterval(async () => {
      const found = await findOpponent(category);
      if (found) clearSearchTimers();
    }, 2000);
  }

  function clearSearchTimers() {
    if (searchIntervalRef.current) { clearInterval(searchIntervalRef.current); searchIntervalRef.current = null; }
    if (pollSearchRef.current)     { clearInterval(pollSearchRef.current);     pollSearchRef.current = null; }
  }

  async function findOpponent(category: string): Promise<boolean> {
    if (phaseRef.current !== "searching") return true;

    const { data: opponents } = await supabase
      .from("ranked_queue")
      .select("*")
      .eq("status", "waiting")
      .neq("user_id", myIdRef.current)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!opponents || opponents.length === 0) return false;
    const opp = opponents[0];

    // Atomic claim: only succeed if the row is still 'waiting'. Conditional
    // UPDATE is the cheapest cross-DB-safe way to prevent two clients from
    // creating duplicate matches for the same opponent.
    const { data: claimed } = await supabase
      .from("ranked_queue")
      .update({ status: "matched" })
      .eq("user_id", opp.user_id)
      .eq("status", "waiting")
      .select()
      .maybeSingle();
    if (!claimed) return false; // someone else grabbed them

    // Claim self too — guards against the symmetric case where both sides race.
    const { data: claimedSelf } = await supabase
      .from("ranked_queue")
      .update({ status: "matched" })
      .eq("user_id", myIdRef.current)
      .eq("status", "waiting")
      .select()
      .maybeSingle();
    if (!claimedSelf) {
      // Roll back opp claim so they can match again
      await supabase.from("ranked_queue").update({ status: "waiting" }).eq("user_id", opp.user_id);
      return false;
    }

    const chosenCategory = opp.preferred_categories?.includes(category) ? category : "mix";
    const now = Date.now();
    const { data: newMatch, error } = await supabase
      .from("ranked_matches")
      .insert({
        player1_id: myIdRef.current,
        player1_name: myNameRef.current,
        player2_id: opp.user_id,
        player2_name: opp.username,
        category: chosenCategory,
        status: "active",
        current_question_index: 0,
        question_start_time: null,
        countdown_start: now,
        player1_score: 0,
        player2_score: 0,
        player1_answers: [],
        player2_answers: [],
        winner_id: null,
      })
      .select()
      .single();

    if (error || !newMatch) {
      console.error("create ranked_match failed", error);
      // best-effort rollback
      await supabase.from("ranked_queue").update({ status: "waiting" }).in("user_id", [myIdRef.current, opp.user_id]);
      return false;
    }

    await startMatch(newMatch as RankedMatch);
    return true;
  }

  async function cancelSearch() {
    await supabase.from("ranked_queue").update({ status: "cancelled" }).eq("user_id", myId);
    setPhaseSafe("select_cats");
  }

  // p2 polls for a match created for them
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
        clearSearchTimers();
        await startMatch(data[0] as RankedMatch);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [phase, myId]);

  // ── MATCH SETUP ──────────────────────────────────────────────────────────

  async function startMatch(m: RankedMatch) {
    matchRef.current = m;
    setMatch(m);
    submittedQRef.current = -1;
    advancedFromRef.current = -1;
    displayedQIdxRef.current = -1;
    finishedRef.current = false;

    const qs = await getMatchQuestions(m.id, m.category);
    const sq = qs.map((q) => shuffleQuestion(q, q.id));
    matchQsRef.current = sq;
    setMatchQs(sq);

    const oppId = m.player1_id === myIdRef.current ? m.player2_id : m.player1_id;
    if (oppId) {
      supabase.from("users").select("country, avatar_url").eq("id", oppId).maybeSingle()
        .then(({ data }) => {
          if (data) { setOppCountry(data.country ?? null); setOppAvatar(data.avatar_url ?? null); }
        });
    }

    playMatchFound();
    setPhaseSafe("matched");
    runCountdown(m);
    startMatchPolling();
  }

  function runCountdown(m: RankedMatch) {
    const start = m.countdown_start ?? Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, Math.ceil((COUNTDOWN_MS - elapsed) / 1000));
      setCountdown(left);
      if (elapsed >= COUNTDOWN_MS) {
        clearInterval(interval);
        hostStartFirstQuestion();
        // Both clients will pick up question 0 on the next pollTick.
      }
    };
    tick();
    const interval = setInterval(tick, 200);
  }

  // Called only by the host (P1) at the very end of countdown to publish the
  // first authoritative question_start_time. Both clients then react to that
  // change via pollTick → showQuestion(0).
  async function hostStartFirstQuestion() {
    if (!matchRef.current) return;
    if (matchRef.current.player1_id !== myIdRef.current) return;
    const now = Date.now();
    await supabase.from("ranked_matches").update({
      current_question_index: 0,
      question_start_time: now,
    }).eq("id", matchRef.current.id);
    matchRef.current = { ...matchRef.current, current_question_index: 0, question_start_time: now };
  }

  // Move the local UI to question `qIdx`. Idempotent.
  function showQuestion(qIdx: number) {
    displayedQIdxRef.current = qIdx;
    submittedQRef.current = -1;
    setSelected(null);
    setQResult(null);
    setCurrentQIdx(qIdx);
    setPhaseSafe("playing");
  }

  // ── Polling loop (single 500ms poller) ────────────────────────────────────
  function startMatchPolling() {
    if (pollMatchRef.current) clearInterval(pollMatchRef.current);
    pollMatchRef.current = setInterval(pollTick, POLL_MS);
  }

  async function pollTick() {
    if (!matchRef.current || finishedRef.current) return;
    const { data } = await supabase
      .from("ranked_matches")
      .select("*")
      .eq("id", matchRef.current.id)
      .maybeSingle();
    if (!data) return;
    const cur = data as RankedMatch;
    matchRef.current = cur;
    setMatch(cur);

    if (cur.status === "finished") {
      handleFinished(cur);
      return;
    }

    const serverQIdx = cur.current_question_index ?? 0;
    const startedAt = cur.question_start_time ?? 0;

    // Wait for host to publish question_start_time before rendering anything.
    if (startedAt <= 0) return;

    // ── 1. SERVER ADVANCED to a new question → swap local UI ───────────────
    if (serverQIdx > displayedQIdxRef.current) {
      showQuestion(serverQIdx);
      // fall through to evaluate timer/answers for the new index
    }

    // From here on, operate on the displayed (== server) index.
    const qIdx = displayedQIdxRef.current;
    if (qIdx < 0) return;

    const isP1 = cur.player1_id === myIdRef.current;
    const p1Ans = (cur.player1_answers ?? [])[qIdx];
    const p2Ans = (cur.player2_answers ?? [])[qIdx];
    const bothAnswered = !!p1Ans && !!p2Ans;
    const elapsed = Date.now() - startedAt;
    const timedOut = elapsed >= QUESTION_TIME_MS + 500;

    // ── 2. Visible countdown ───────────────────────────────────────────────
    if (phaseRef.current === "playing") {
      const left = Math.max(0, Math.ceil((QUESTION_TIME_MS - elapsed) / 1000));
      setTimeLeft(left);
      if (left <= 3 && left > 0) playTick();
    }

    // ── 3. Auto-submit null on timeout ────────────────────────────────────
    if (
      phaseRef.current === "playing" &&
      submittedQRef.current !== qIdx &&
      timedOut
    ) {
      await writeMyAnswer(null, qIdx, 0, QUESTION_TIME_MS);
    }

    // ── 4. Both answered → q_result, then scoreboard ──────────────────────
    if (phaseRef.current === "playing" && bothAnswered) {
      setQResult({ p1Pts: p1Ans?.pts ?? 0, p2Pts: p2Ans?.pts ?? 0 });
      setMyTotalScore(isP1 ? cur.player1_score : cur.player2_score);
      setOppTotalScore(isP1 ? cur.player2_score : cur.player1_score);
      setPhaseSafe("q_result");
      const lockedIdx = qIdx;
      setTimeout(() => {
        if (phaseRef.current === "q_result" && displayedQIdxRef.current === lockedIdx) {
          setPhaseSafe("scoreboard");
        }
      }, 1500);
    }

    // ── 5. Host: advance the question on the server ───────────────────────
    if (
      isP1 &&
      cur.status === "active" &&
      advancedFromRef.current < qIdx &&
      (bothAnswered || timedOut)
    ) {
      advancedFromRef.current = qIdx;
      setTimeout(() => advanceQuestionOnServer(qIdx), SCOREBOARD_MS + 1500);
    }
  }

  // Host-only. Pure server-side advance — local UI re-syncs via pollTick.
  async function advanceQuestionOnServer(fromIdx: number) {
    if (!matchRef.current || finishedRef.current) return;
    const nextIdx = fromIdx + 1;

    if (nextIdx >= MATCH_QUESTIONS) {
      await finishMatch();
      return;
    }

    const now = Date.now();
    await supabase.from("ranked_matches").update({
      current_question_index: nextIdx,
      question_start_time: now,
    }).eq("id", matchRef.current.id);
  }

  // ── Submitting answers ───────────────────────────────────────────────────

  async function writeMyAnswer(ans: number | null, qIdx: number, pts: number, ms: number) {
    if (!matchRef.current) return;
    if (submittedQRef.current === qIdx) return;
    submittedQRef.current = qIdx;

    const isP1 = matchRef.current.player1_id === myIdRef.current;
    const field = isP1 ? "player1_answers" : "player2_answers";
    const scoreField = isP1 ? "player1_score" : "player2_score";

    const arr: AnswerEntry[] = [...((matchRef.current[field] as AnswerEntry[]) ?? [])];
    while (arr.length < qIdx) arr.push({ ans: null, pts: 0, ms: 0 });
    arr[qIdx] = { ans, pts, ms };

    const newScore = ((matchRef.current[scoreField] as number) ?? 0) + pts;

    const { data, error } = await supabase
      .from("ranked_matches")
      .update({
        [field]: arr,
        [scoreField]: newScore,
      })
      .eq("id", matchRef.current.id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn("writeMyAnswer error", error);
      return;
    }
    if (data) {
      matchRef.current = data as RankedMatch;
      setMatch(data as RankedMatch);
      setMyTotalScore(isP1 ? (data as RankedMatch).player1_score : (data as RankedMatch).player2_score);
    }
  }

  function handleAnswer(idx: number) {
    if (phaseRef.current !== "playing" || selected !== null || !matchRef.current) return;
    const m = matchRef.current;
    const qIdx = m.current_question_index ?? 0;
    const startedAt = m.question_start_time ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const q = matchQsRef.current[qIdx];
    const correct = !!q && idx === q.correct;
    const pts = pointsForElapsedMs(elapsed, correct);
    setSelected(idx);
    if (correct) playCorrect(); else playWrong();
    void writeMyAnswer(idx, qIdx, pts, elapsed);
  }

  // ── Finish ───────────────────────────────────────────────────────────────

  async function finishMatch() {
    if (!matchRef.current || finishedRef.current) return;
    finishedRef.current = true;
    const m = matchRef.current;
    const myFinalScore = (m.player1_id === myIdRef.current) ? m.player1_score : m.player2_score;
    const oppFinalScore = (m.player1_id === myIdRef.current) ? m.player2_score : m.player1_score;
    let winnerId: string | null = null;
    if (m.player1_score > m.player2_score) winnerId = m.player1_id;
    else if (m.player2_score > m.player1_score) winnerId = m.player2_id;

    await supabase.from("ranked_matches").update({
      status: "finished",
      winner_id: winnerId,
    }).eq("id", m.id);

    setMyTotalScore(myFinalScore);
    setOppTotalScore(oppFinalScore);
    handleFinished({ ...m, status: "finished", winner_id: winnerId });
  }

  function handleFinished(cur: RankedMatch) {
    if (phaseRef.current === "finished") return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollMatchRef.current) clearInterval(pollMatchRef.current);
    pollMatchRef.current = null;
    finishedRef.current = true;

    const isP1 = cur.player1_id === myIdRef.current;
    const myScore = isP1 ? cur.player1_score : cur.player2_score;
    const oppScore = isP1 ? cur.player2_score : cur.player1_score;
    setMyTotalScore(myScore);
    setOppTotalScore(oppScore);

    const w: "me" | "opponent" | "draw" =
      cur.winner_id === myIdRef.current ? "me" :
      cur.winner_id ? "opponent" : "draw";
    setWinner(w);
    if (w === "me") playGameOver();
    else if (w === "opponent") playWrong();
    setPhaseSafe("finished");

    const won = w === "me";
    const draw = w === "draw";
    const delta = won ? 20 : draw ? 0 : -5;
    if (delta !== 0) {
      supabase.from("ranked_queue")
        .select("rank_points")
        .eq("user_id", myIdRef.current)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const newPts = Math.max(0, (data.rank_points ?? 0) + delta);
            supabase.from("ranked_queue").update({ rank_points: newPts }).eq("user_id", myIdRef.current).then(() => {
              setMyPoints(newPts);
            });
          }
        });
    }

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
          total_correct:     myScore,
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

    if (won) recordTodayWin(); else if (!draw) recordTodayLoss();
    recordTodayXP(won ? XP_REWARDS.win_ranked : (draw ? 15 : 5));
  }

  // ── RENDER ────────────────────────────────────────────────────────────────

  const myRank = getRankInfo(myPoints);
  const currentQ = matchQs[currentQIdx] ?? null;
  const isP1 = match?.player1_id === myId;
  const opponentName = isP1 ? match?.player2_name : match?.player1_name;
  const isDanger = timeLeft <= 3;
  const timerPct = (timeLeft / 10) * 100;

  // ── SELECT CATEGORIES ────────────────────────────────────────────────────
  if (phase === "select_cats") {
    const isPremium = !!(dbUser?.is_premium ?? localUser.isPremium);
    const cats = [
      { id: "mix", name: "مزيج", icon: "🌐" },
      ...CATEGORIES.filter((c) => !c.isPremium || isPremium).map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    ];
    const rankedRemaining = getRemainingRanked();
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

          {!isPremium && (
            <div className="bg-purple-500/10 border border-purple-500/25 rounded-xl p-3 text-center text-xs">
              <span className="text-purple-300 font-bold">⚡ الجولات المتبقية اليوم: </span>
              <span className="text-white font-black">{rankedRemaining === Infinity ? "∞" : rankedRemaining}</span>
              <span className="text-muted-foreground"> / 5</span>
            </div>
          )}
          <div className="bg-card border border-border rounded-2xl p-4 text-sm space-y-1.5">
            <p className="font-bold text-center mb-2">⚡ قواعد التحدي</p>
            <p className="text-muted-foreground">• 10 أسئلة · 10 ثوانٍ لكل سؤال</p>
            <p className="text-muted-foreground">• الإجابة أسرع = نقاط أكثر (10/8/6/4/2)</p>
            <p className="text-muted-foreground">• ينتقل السؤال بعد إجابة كلا اللاعبين أو انتهاء الوقت</p>
            <p className="text-muted-foreground">• فوز: +20 · تعادل: 0 · خسارة: -5</p>
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

  // ── SCOREBOARD (between questions) ───────────────────────────────────────
  if (phase === "scoreboard" && match) {
    const myS = isP1 ? match.player1_score : match.player2_score;
    const oppS = isP1 ? match.player2_score : match.player1_score;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6 gap-6 text-center">
        <div className="fade-in-up space-y-5 w-full max-w-sm">
          <p className="text-xs text-muted-foreground font-bold">السؤال {currentQIdx + 1}/{MATCH_QUESTIONS}</p>
          <h2 className="text-lg font-black text-primary">📊 النتيجة الحالية</h2>
          <div className="bg-card border border-border rounded-2xl p-5 flex justify-around">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">أنت</p>
              <p className="text-4xl font-black text-primary">{myS}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{myName}</p>
            </div>
            <div className="text-3xl font-black text-muted-foreground self-center">vs</div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">الخصم</p>
              <p className="text-4xl font-black text-secondary">{oppS}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{opponentName}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">السؤال التالي خلال لحظات...</p>
          <div className="w-6 h-6 mx-auto border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── PLAYING / Q_RESULT ───────────────────────────────────────────────────
  if ((phase === "playing" || phase === "q_result") && currentQ && match) {
    const myFlag = dbUser?.country ? getCountryFlag(dbUser.country) : "";
    const oppFlag = oppCountry ? getCountryFlag(oppCountry) : "";
    const myAvatar = dbUser?.avatar_url;
    const myScoreVal = isP1 ? match.player1_score : match.player2_score;
    const oppScoreVal = isP1 ? match.player2_score : match.player1_score;
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-3 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-2">
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
                <p className="text-lg font-black text-primary leading-none">{myScoreVal}</p>
              </div>
            </div>

            <div className="flex flex-col items-center px-1 shrink-0 gap-1">
              <p className="text-[9px] text-muted-foreground">{currentQIdx + 1}/{MATCH_QUESTIONS}</p>
              {phase === "q_result" ? (
                <span className="text-2xl font-black text-green-400">✓</span>
              ) : (
                <CircularTimer timeLeft={timeLeft} totalTime={10} size={56} strokeWidth={5} />
              )}
            </div>

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
                <p className="text-lg font-black text-secondary leading-none">{oppScoreVal}</p>
              </div>
            </div>
          </div>

        </header>

        <div key={`ranked-${currentQIdx}`} className="flex-1 flex flex-col justify-center p-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-base font-bold leading-relaxed">{currentQ.question}</p>
          </div>

          {phase === "q_result" && qResult && (
            <div className={`py-3 rounded-2xl text-center font-black ${selected === currentQ.correct ? "bg-green-500/20 border border-green-500/40 text-green-400" : "bg-red-500/20 border border-red-500/40 text-red-400"}`}>
              {selected === currentQ.correct
                ? `🎉 صحيح! +${isP1 ? qResult.p1Pts : qResult.p2Pts} نقاط`
                : selected === null
                  ? `⏱ انتهى الوقت. الإجابة: ${["أ","ب","ج","د"][currentQ.correct]}`
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
                  onClick={() => handleAnswer(idx)}
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
            score={myTotalScore}
            total={Math.max(myTotalScore, oppTotalScore, 1)}
            xpEarned={rewardSummary?.xp ?? 0}
            coinsEarned={rewardSummary?.coins ?? 0}
            category="مصنّف"
            level={myRank.label}
            levelIcon={myRank.icon}
            gameMode="ranked"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={() => { cleanup(); setMatch(null); setSelected(null); setQResult(null); setCurrentQIdx(0); finishedRef.current = false; setPhaseSafe("select_cats"); }}
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
