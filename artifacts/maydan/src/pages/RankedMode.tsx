import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, Question } from "@/lib/questions";
import CircularTimer from "@/components/CircularTimer";
import ReportFlag from "@/components/ReportFlag";
import { shuffleQuestion } from "@/lib/shuffle";
import { fetchQuestionsByIds, fetchSeededQuestions } from "@/lib/questionService";
import { resolveCategorySelection, validateCategorySelectionKey } from "@/lib/categoriesService";
import { useAuth } from "@/lib/AuthContext";
import { getOrCreateUser, canPlayRanked, getRemainingRanked, incrementRankedCount } from "@/lib/storage";
import { playCorrect, playWrong, playTick, playGameOver, playMatchFound, playSound } from "@/lib/sound";
import { useBackgroundMusic } from "@/lib/useBackgroundMusic";
import { flashScreen } from "@/lib/flash";
import { RANKS, getRankInfo } from "@/lib/rank";
import { getCountryFlag } from "@/lib/countryUtils";
import { recordTodayWin, recordTodayLoss, recordTodayXP } from "@/lib/storage";
import AchievementPopup from "@/components/AchievementPopup";
import FloatingReward from "@/components/FloatingReward";
import ShareCard from "@/components/ShareCard";
import CategoryPicker from "@/components/CategoryPicker";
import { XP_REWARDS, COIN_REWARDS } from "@/lib/gamification";
import { recordCompletedGameForInstall } from "@/lib/pwa";
import {
  advanceRankedMatch,
  cancelRankedQueue,
  enterRankedQueue,
  submitRankedAnswer,
} from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────────

type Phase =
  | "select_cats"
  | "searching"
  | "matched"
  | "playing"
  | "q_result"
  | "scoreboard"
  | "finished";

type AnswerEntry = { ans: string | null; pts: number; ms: number; correct?: boolean };

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
  question_ids: number[];
}

const RANKED_MATCH_COLUMNS = "id, player1_id, player1_name, player2_id, player2_name, category, status, current_question_index, question_start_time, countdown_start, player1_score, player2_score, player1_answers, player2_answers, winner_id, question_ids" as const;

// ── Constants ───────────────────────────────────────────────────────────────

const E2E_TIMING =
  import.meta.env.VITE_E2E_TIMING === "1" &&
  new URLSearchParams(window.location.search).has("__e2e");
const QUESTION_TIME_MS = E2E_TIMING ? 800 : 10000;
const COUNTDOWN_MS = E2E_TIMING ? 150 : 3000;
const SCOREBOARD_MS = E2E_TIMING ? 100 : 2500;
const MATCH_QUESTIONS = E2E_TIMING ? 2 : 10;
const SEARCH_TIMEOUT = 60;
const POLL_MS = E2E_TIMING ? 50 : 500;

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
  useBackgroundMusic("party");
  const localUser = getOrCreateUser();

  const myId = dbUser?.id ?? (localUser.userId ? `guest_${localUser.userId}` : "");
  const myName = dbUser?.username ?? localUser.displayName ?? "لاعب";
  const [myPoints, setMyPoints] = useState(0);

  const [phase, setPhase] = useState<Phase>("select_cats");
  const searchParams = new URLSearchParams(window.location.search);
  const passedCat = searchParams.get("cat");
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
  const [resultingRankPoints, setResultingRankPoints] = useState<number | null>(null);

  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollSearchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollMatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const cancelledRef = useRef(false);
  const matchRef = useRef<RankedMatch | null>(null);
  const myIdRef = useRef(myId);
  const myNameRef = useRef(myName);
  const phaseRef = useRef<Phase>("select_cats");
  const matchQsRef = useRef<Question[]>([]);
  const submittedQRef = useRef<number>(-1);     // last qIdx for which I already wrote my answer
  const advancedFromRef = useRef<number>(-1);   // last qIdx that p1 already advanced past
  const displayedQIdxRef = useRef<number>(-1);  // qIdx currently shown to the user
  const finishedRef = useRef(false);
  const correctCountRef = useRef(0);
  const countedCorrectQRef = useRef<number>(-1);

  useEffect(() => {
    myIdRef.current = myId;
    myNameRef.current = myName;
  }, [myId, myName]);

  useEffect(() => {
    loadMyPoints();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!passedCat) return;
    void validateCategorySelectionKey(passedCat, !!dbUser?.is_premium).then((valid) => {
      if (valid) setSelectedCats([passedCat]);
    });
  }, [passedCat, dbUser?.is_premium]);

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
    cancelledRef.current = true;
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    if (pollSearchRef.current) clearInterval(pollSearchRef.current);
    if (pollMatchRef.current) clearInterval(pollMatchRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    transitionTimeoutsRef.current.forEach(clearTimeout);
    transitionTimeoutsRef.current.clear();
    searchIntervalRef.current = null;
    pollSearchRef.current = null;
    pollMatchRef.current = null;
    timerRef.current = null;
    countdownIntervalRef.current = null;
  }

  function scheduleTransition(callback: () => void, delay: number) {
    const timeoutId = setTimeout(() => {
      transitionTimeoutsRef.current.delete(timeoutId);
      if (!cancelledRef.current) callback();
    }, delay);
    transitionTimeoutsRef.current.add(timeoutId);
    return timeoutId;
  }

  // ── MATCHMAKING ──────────────────────────────────────────────────────────

  async function enterQueue() {
    if (!myId) return;
    cancelledRef.current = false;
    if (!canPlayRanked()) {
      alert("لقد استنفدت جولاتك المصنّفة اليوم (5/يوم). ترقّ إلى ميدان برو لجولات غير محدودة.");
      navigate("/premium");
      return;
    }
    incrementRankedCount();
    const concreteCategories = selectedCats.length
      ? await resolveCategorySelection(selectedCats)
      : [];
    const category = concreteCategories.length > 0
      ? concreteCategories[Math.floor(Math.random() * concreteCategories.length)]
      : "mix";

    setPhaseSafe("searching");
    setSearchTimer(SEARCH_TIMEOUT);
    try {
      const created = await enterRankedQueue({
        userId: myId,
        username: myName,
        preferredCategories: concreteCategories,
      });
      if (created) {
        clearSearchTimers();
        await startMatch(created as unknown as RankedMatch);
        return;
      }
    } catch (error) {
      console.error("enter ranked queue failed", error);
      setPhaseSafe("select_cats");
      return;
    }
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
    }, E2E_TIMING ? 50 : 2000);
  }

  function clearSearchTimers() {
    if (searchIntervalRef.current) { clearInterval(searchIntervalRef.current); searchIntervalRef.current = null; }
    if (pollSearchRef.current)     { clearInterval(pollSearchRef.current);     pollSearchRef.current = null; }
  }

  async function findOpponent(category: string): Promise<boolean> {
    if (phaseRef.current !== "searching") return true;
    try {
      const found = await enterRankedQueue({
        userId: myIdRef.current,
        username: myNameRef.current,
        preferredCategories: [category],
      });
      if (!found) return false;
      await startMatch(found as unknown as RankedMatch);
      return true;
    } catch (error) {
      console.warn("ranked matchmaking retry failed", error);
      return false;
    }
  }

  async function cancelSearch() {
    cancelledRef.current = true;
    await cancelRankedQueue(myId).catch((error) => console.warn("cancel ranked queue failed", error));
    setPhaseSafe("select_cats");
  }

  // p2 polls for a match created for them
  useEffect(() => {
    if (phase !== "searching") return;
    const interval = setInterval(async () => {
      if (phaseRef.current !== "searching") { clearInterval(interval); return; }
      const { data } = await supabase
        .from("ranked_matches")
        .select(RANKED_MATCH_COLUMNS)
        .eq("player2_id", myId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        clearInterval(interval);
        clearSearchTimers();
        await startMatch(data[0] as RankedMatch);
      }
    }, E2E_TIMING ? 50 : 1500);
    return () => clearInterval(interval);
  }, [phase, myId]);

  // ── MATCH SETUP ──────────────────────────────────────────────────────────

  async function startMatch(m: RankedMatch) {
    if (cancelledRef.current) return;
    matchRef.current = m;
    setMatch(m);
    submittedQRef.current = -1;
    advancedFromRef.current = -1;
    displayedQIdxRef.current = -1;
    finishedRef.current = false;
    correctCountRef.current = 0;
    countedCorrectQRef.current = -1;

    const qs = m.question_ids?.length
      ? await fetchQuestionsByIds(m.question_ids)
      : await getMatchQuestions(m.id, m.category);
    if (cancelledRef.current) return;
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
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    const start = m.countdown_start ?? Date.now();
    const tick = () => {
      if (cancelledRef.current || phaseRef.current !== "matched") {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        return;
      }
      const elapsed = Date.now() - start;
      const left = Math.max(0, Math.ceil((COUNTDOWN_MS - elapsed) / 1000));
      setCountdown(left);
      if (elapsed >= COUNTDOWN_MS) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        hostStartFirstQuestion();
        // Both clients will pick up question 0 on the next pollTick.
      }
    };
    countdownIntervalRef.current = setInterval(tick, 200);
    tick();
  }

  // Either participant may publish the first authoritative start. The RPC row
  // lock makes simultaneous calls idempotent and avoids depending on P1.
  async function hostStartFirstQuestion() {
    if (cancelledRef.current || phaseRef.current !== "matched" || !matchRef.current) return;
    try {
      const updated = await advanceRankedMatch(matchRef.current.id, myIdRef.current, -1) as unknown as RankedMatch;
      matchRef.current = updated;
      setMatch(updated);
    } catch (error) {
      console.warn("start ranked match failed", error);
    }
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
      .select(RANKED_MATCH_COLUMNS)
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
      await writeMyAnswer(null, qIdx, 0, QUESTION_TIME_MS, false);
    }

    // ── 4. Both answered → q_result, then scoreboard ──────────────────────
    if (phaseRef.current === "playing" && bothAnswered) {
      setQResult({ p1Pts: p1Ans?.pts ?? 0, p2Pts: p2Ans?.pts ?? 0 });
      setMyTotalScore(isP1 ? cur.player1_score : cur.player2_score);
      setOppTotalScore(isP1 ? cur.player2_score : cur.player1_score);
      setPhaseSafe("q_result");
      const lockedIdx = qIdx;
      scheduleTransition(() => {
        if (phaseRef.current === "q_result" && displayedQIdxRef.current === lockedIdx) {
          setPhaseSafe("scoreboard");
        }
      }, E2E_TIMING ? 300 : 1500);
    }

    // ── 5. Either participant may advance; the RPC serializes races ───────
    if (
      cur.status === "active" &&
      advancedFromRef.current < qIdx &&
      (bothAnswered || timedOut)
    ) {
      advancedFromRef.current = qIdx;
      scheduleTransition(() => { void advanceQuestionOnServer(qIdx); }, SCOREBOARD_MS + 1500);
    }
  }

  // Pure server-side advance — local UI re-syncs via pollTick.
  async function advanceQuestionOnServer(fromIdx: number) {
    if (cancelledRef.current || !matchRef.current || finishedRef.current) return;
    const nextIdx = fromIdx + 1;

    if (nextIdx >= MATCH_QUESTIONS) {
      await finishMatch(fromIdx);
      return;
    }
    try {
      const updated = await advanceRankedMatch(
        matchRef.current.id,
        myIdRef.current,
        fromIdx,
      ) as unknown as RankedMatch;
      matchRef.current = updated;
      setMatch(updated);
    } catch (error) {
      advancedFromRef.current = fromIdx - 1;
      console.warn("advance ranked question failed", error);
    }
  }

  // ── Submitting answers ───────────────────────────────────────────────────

  async function writeMyAnswer(ans: number | null, qIdx: number, _pts: number, _ms: number, correct: boolean) {
    if (!matchRef.current) return;
    if (submittedQRef.current === qIdx) return;
    submittedQRef.current = qIdx;

    const isP1 = matchRef.current.player1_id === myIdRef.current;
    const question = matchQsRef.current[qIdx];
    try {
      const data = await submitRankedAnswer({
        matchId: matchRef.current.id,
        userId: myIdRef.current,
        questionIndex: qIdx,
        questionId: question.id,
        answerText: ans === null ? null : question.options[ans] ?? null,
      }) as unknown as RankedMatch;
      const serverAnswer = (isP1 ? data.player1_answers : data.player2_answers)?.[qIdx];
      if (serverAnswer?.correct && countedCorrectQRef.current !== qIdx) {
        countedCorrectQRef.current = qIdx;
        correctCountRef.current += 1;
      }
      matchRef.current = data;
      setMatch(data);
      setMyTotalScore(isP1 ? data.player1_score : data.player2_score);
    } catch (error) {
      console.warn("writeMyAnswer error", error);
      submittedQRef.current = -1;
      setSelected(null);
      return;
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
    if (correct) { playCorrect(); flashScreen("correct"); }
    else { playWrong(); flashScreen("wrong"); }
    void writeMyAnswer(idx, qIdx, pts, elapsed, correct);
  }

  // ── Finish ───────────────────────────────────────────────────────────────

  async function finishMatch(fromIdx: number) {
    if (!matchRef.current || finishedRef.current) return;
    try {
      const updated = await advanceRankedMatch(
        matchRef.current.id,
        myIdRef.current,
        fromIdx,
      ) as unknown as RankedMatch;
      matchRef.current = updated;
      setMatch(updated);
      if (updated.status === "finished") handleFinished(updated);
      else advancedFromRef.current = fromIdx - 1;
    } catch (error) {
      advancedFromRef.current = fromIdx - 1;
      console.warn("finish ranked match failed", error);
    }
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
    recordCompletedGameForInstall();

    const won = w === "me";
    const draw = w === "draw";
    const delta = won ? 20 : draw ? 0 : -20;
    supabase.from("ranked_queue").select("rank_points").eq("user_id", myIdRef.current)
      .maybeSingle().then(({ data }) => {
        const serverPoints = data?.rank_points ?? Math.max(0, myPoints + delta);
        setMyPoints(serverPoints);
        setResultingRankPoints(serverPoints);
      });

    if (dbUser?.id) {
      const xpGain = won ? XP_REWARDS.win_ranked : (draw ? 15 : 5);
      const coinGain = won ? COIN_REWARDS.win_ranked : 0;
      setShowReward({ xp: xpGain, coins: coinGain });
      setRewardSummary({ xp: xpGain, coins: coinGain, achievements: 0 });
      if (coinGain > 0) playSound("coin");
      void refreshUser();
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
              فوز: +20 نقطة · خسارة: -20 نقطة
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-bold mb-2">اختر فئاتك المفضلة (اختياري)</p>
            <CategoryPicker
              onSelect={(id) => setSelectedCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              isPremium={isPremium}
              includeMix={false}
              size="small"
              multiSelect={true}
              selectedIds={selectedCats}
              onToggle={(id) => setSelectedCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">إذا لم تختر أي فئة، سيتم اختيار المزيج تلقائياً</p>
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
            <p className="text-muted-foreground">• فوز: +20 · تعادل: 0 · خسارة: -20</p>
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
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-5 sm:p-8 gap-8 text-center overflow-hidden">
        <div className="fade-in-up space-y-5 w-full max-w-sm" data-testid="status-ranked-searching" aria-live="polite">
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 rounded-full bg-secondary/10 animate-ping motion-reduce:animate-none" />
            <div className="absolute inset-2 rounded-full border-4 border-secondary/25 border-t-secondary animate-spin motion-reduce:animate-none" />
            <div className="absolute inset-0 flex items-center justify-center text-4xl animate-pulse motion-reduce:animate-none">⚔️</div>
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary">جاري البحث عن خصم...</h1>
            <p className="text-muted-foreground text-sm leading-relaxed mt-2">نبحث عن منافس مناسب لرتبتك وفئاتك</p>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-full bg-card border border-border w-fit mx-auto px-5 py-2.5">
            <span className="text-muted-foreground text-sm">⏱️</span>
            <span className="text-xl font-black tabular-nums text-primary" data-testid="text-ranked-search-time">{searchTimer}ث</span>
          </div>
        </div>
        <button
          onClick={() => { clearSearchTimers(); cancelSearch(); }}
          data-testid="button-cancel-ranked-search"
          className="min-h-12 px-8 py-3 rounded-xl bg-card border border-border text-sm font-bold text-foreground active:scale-[0.98]"
        >
          إلغاء البحث
        </button>
      </div>
    );
  }

  // ── MATCHED COUNTDOWN ─────────────────────────────────────────────────────
  if (phase === "matched" && match) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-8 gap-6 text-center overflow-hidden">
        <div className="fade-in-up w-full max-w-lg" data-testid="status-ranked-match-found" aria-live="assertive">
          <p className="text-green-500 font-black text-base mb-5">✓ تم العثور على منافس!</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8 mb-8 bg-card/70 border border-border rounded-3xl p-4 sm:p-6 shadow-xl">
            <div className="text-center min-w-0">
              <div className="w-20 h-20 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center mx-auto mb-2 text-3xl font-black text-primary">
                {myName.charAt(0)}
              </div>
              <p className="text-sm font-bold break-words">{myName}</p>
              <p className="text-xs text-muted-foreground">أنت</p>
            </div>
            <div className="text-2xl sm:text-4xl font-black text-primary animate-pulse motion-reduce:animate-none" aria-label="ضد">VS</div>
            <div className="text-center min-w-0">
              <div className="w-20 h-20 rounded-full bg-secondary/15 border-2 border-secondary flex items-center justify-center mx-auto mb-2 text-3xl font-black text-secondary">
                {opponentName?.charAt(0) ?? "؟"}
              </div>
              <p className="text-sm font-bold break-words" data-testid="text-ranked-opponent-name">{opponentName}</p>
              <p className="text-xs text-muted-foreground">الخصم</p>
            </div>
          </div>
          <div className="text-7xl font-black text-primary tabular-nums animate-pulse motion-reduce:animate-none" data-testid="text-ranked-countdown">{countdown}</div>
          <p className="text-muted-foreground text-sm mt-3">استعد... المواجهة تبدأ الآن</p>
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
        <div className="fade-in-up space-y-5 w-full max-w-sm" data-testid="status-ranked-scoreboard">
          <p className="text-xs text-muted-foreground font-bold">السؤال {currentQIdx + 1}/{MATCH_QUESTIONS}</p>
          <h2 className="text-lg font-black text-primary">📊 النتيجة الحالية</h2>
          <div className="bg-card border border-border rounded-2xl p-5 flex justify-around">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">أنت</p>
              <p className="text-4xl font-black text-primary" data-testid="text-ranked-my-score">{myS}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{myName}</p>
            </div>
            <div className="text-3xl font-black text-muted-foreground self-center">vs</div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">الخصم</p>
              <p className="text-4xl font-black text-secondary" data-testid="text-ranked-scoreboard-opponent-score">{oppS}</p>
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
      <div className="min-h-screen gradient-hero flex flex-col" data-testid={phase === "q_result" ? "status-ranked-reveal" : "status-ranked-question"}>
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
                <p className="text-lg font-black text-primary leading-none" data-testid="text-ranked-live-score">{myScoreVal}</p>
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

            <div className="flex-1 flex items-center gap-2 bg-secondary/10 rounded-xl p-2 border-2 border-secondary/50 flex-row-reverse text-right shadow-sm" data-testid="status-ranked-opponent-live-score">
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
                <p className="text-2xl font-black text-secondary leading-none tabular-nums" data-testid="text-ranked-opponent-score">{oppScoreVal}</p>
              </div>
            </div>
          </div>

        </header>

        <div key={`ranked-${currentQIdx}`} className="flex-1 flex flex-col justify-center p-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 text-center relative">
            <ReportFlag questionId={currentQ.id} questionText={currentQ.question} reporter={myName ?? null} />
            <p className="text-base font-bold leading-relaxed break-words [overflow-wrap:anywhere]">{currentQ.question}</p>
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
              let cls = "w-full min-h-14 p-3.5 rounded-xl text-right font-bold text-sm border-2 transition-none break-words [overflow-wrap:anywhere]";
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
                  data-testid={`button-ranked-answer-${idx}`}
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
    const delta = won ? +20 : draw ? 0 : -20;
    const finalRankPoints = resultingRankPoints ?? myPoints;
    const resultingRank = getRankInfo(finalRankPoints);
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-6 gap-6 text-center overflow-y-auto">
        {showReward && (
          <FloatingReward xp={showReward.xp} coins={showReward.coins} onDone={() => setShowReward(null)} />
        )}
        {newAchievements.length > 0 && (
          <AchievementPopup unlockedIds={newAchievements} onDone={() => setNewAchievements([])} />
        )}
        <div className="fade-in-up" data-testid="status-ranked-final-result" aria-live="assertive">
          <p className="text-7xl mb-3">{won ? "🏆" : draw ? "🤝" : "😔"}</p>
          <h1 className="text-3xl font-black" style={{ color: won ? "#f59e0b" : draw ? "#94a3b8" : "#ef4444" }}>
            {won ? "فزت!" : draw ? "تعادل!" : "خسرت!"}
          </h1>
        </div>

        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5">
          <div className="flex justify-around">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">أنت</p>
              <p className="text-4xl font-black text-primary" data-testid="text-ranked-final-my-score">{myTotalScore}</p>
              <p className="text-xs text-muted-foreground">{myName}</p>
            </div>
            <div className="text-3xl font-black text-muted-foreground self-center">vs</div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">الخصم</p>
              <p className="text-4xl font-black text-secondary" data-testid="text-ranked-final-opponent-score">{oppTotalScore}</p>
              <p className="text-xs text-muted-foreground">{opponentName}</p>
            </div>
          </div>
        </div>

        <div className={`w-full max-w-sm rounded-2xl p-4 border text-center ${won ? "bg-green-500/10 border-green-500/30" : draw ? "bg-slate-400/10 border-slate-400/30" : "bg-red-500/10 border-red-500/30"}`}>
          <p className="text-sm text-muted-foreground">نقاط الرتبة</p>
          <p className={`text-3xl font-black ${delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground"}`} data-testid="text-ranked-rating-delta">
            {delta > 0 ? "+" : ""}{delta}
          </p>
          <p className="text-sm text-foreground mt-2 font-bold" data-testid="text-ranked-resulting-rank">
            الرتبة الناتجة: {resultingRank.icon} {resultingRank.label}
          </p>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-ranked-resulting-points">المجموع: {finalRankPoints} نقطة</p>
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
          <button onClick={() => { cleanup(); setMatch(null); setSelected(null); setQResult(null); setCurrentQIdx(0); setResultingRankPoints(null); finishedRef.current = false; setPhaseSafe("select_cats"); }}
            data-testid="button-ranked-play-again"
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
