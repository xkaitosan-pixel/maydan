import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { getOrCreateUser } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, Question } from "@/lib/questions";
import { fetchSeededQuestions } from "@/lib/questionService";
import { validateCategorySelectionKey } from "@/lib/categoriesService";
import { shuffleQuestion } from "@/lib/shuffle";
import QuestionImage from "@/components/QuestionImage";
import CircularTimer from "@/components/CircularTimer";
import { playSound } from "@/lib/sound";
import { useBackgroundMusic } from "@/lib/useBackgroundMusic";
import {
  PARTY_HOST_SESSION_KEY,
  parsePartyHostSession,
  serializePartyHostSession,
} from "@/lib/partySession";
import { partySettlementResumeDecision } from "@/lib/partySettlement";
import { QRCodeSVG } from "qrcode.react";

import CategoryPicker from "@/components/CategoryPicker";

// ── Types ─────────────────────────────────────────────────────────────────────
type HostPhase = "setup" | "lobby" | "question" | "reveal" | "leaderboard" | "finished";

interface PartyPlayer {
  id: string;
  room_code: string;
  nickname: string;
  score: number;
  answered_current: boolean;
  last_answer: number | null;
  answered_at: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MEDALS = ["🥇", "🥈", "🥉"];
const E2E_TIMING =
  import.meta.env.VITE_E2E_TIMING === "1" &&
  new URLSearchParams(window.location.search).has("__e2e");
const PARTY_POLL_MS = E2E_TIMING ? 100 : 1000;
const ALL_ANSWERED_DELAY_MS = E2E_TIMING ? 50 : 1500;
const REVEAL_DURATION_MS = E2E_TIMING ? 1200 : 5000;

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

async function getPartyQuestions(code: string, category: string, count: number) {
  return fetchSeededQuestions(category, code + category, count);
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
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-50 motion-reduce:hidden" aria-hidden="true">
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
  const { dbUser } = useAuth();
  useBackgroundMusic("party");

  // Local phase (mirrors DB status but with extra local states)
  const searchParams = new URLSearchParams(window.location.search);
  const passedCat = searchParams.get("cat");
  const [phase, setPhase] = useState<HostPhase>("setup");
  const [roomCode, setRoomCode] = useState("");
  const [category, setCategory] = useState("mix");
  const [questionCount, setQuestionCount] = useState(10);
  const [answerTime, setAnswerTime] = useState(20);
  const [showQuestionOnPhone, setShowQuestionOnPhone] = useState(false);
  const [scoringType, setScoringType] = useState<"speed" | "equal">("speed");
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [partyQs, setPartyQs] = useState<Question[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [creating, setCreating] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [hostConnectionLost, setHostConnectionLost] = useState(false);
  const [error, setError] = useState("");
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [allAnsweredAlert, setAllAnsweredAlert] = useState(false);
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState(0);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(0);
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isLandscape, setIsLandscape] = useState(() => window.innerWidth > window.innerHeight);
  const [shareFeedback, setShareFeedback] = useState<"copied" | null>(null);

  useEffect(() => {
    if (!passedCat) return;
    const isPremium = !!(dbUser?.is_premium ?? getOrCreateUser().isPremium);
    void validateCategorySelectionKey(passedCat, isPremium).then((valid) => {
      if (valid) setCategory(passedCat);
    });
  }, [passedCat, dbUser?.is_premium]);

  // Refs to avoid stale closures
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatFailuresRef = useRef(0);
  const codeRef = useRef("");
  const hostTokenRef = useRef("");
  const phaseRef = useRef<HostPhase>("setup");
  const currentQIdxRef = useRef(0);
  const partyQsRef = useRef<Question[]>([]);
  const answerTimeRef = useRef(20);
  const scoringTypeRef = useRef<"speed" | "equal">("speed");
  // Guards to prevent double-reveal (timer race vs all-answered race)
  const revealCalledRef = useRef(false);
  const questionStartMsRef = useRef(0);
  // Separate poll for DB-direct answered-count check during question phase
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const allAnsweredDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealLeaderboardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fanfareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTransitionTimeouts = useCallback(() => {
    if (allAnsweredDelayRef.current) clearTimeout(allAnsweredDelayRef.current);
    if (revealLeaderboardTimeoutRef.current) clearTimeout(revealLeaderboardTimeoutRef.current);
    if (fanfareTimeoutRef.current) clearTimeout(fanfareTimeoutRef.current);
    allAnsweredDelayRef.current = null;
    revealLeaderboardTimeoutRef.current = null;
    fanfareTimeoutRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (answerPollRef.current) clearInterval(answerPollRef.current);
      if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
      clearTransitionTimeouts();
    };
  }, [clearTransitionTimeouts]);

  // Landscape detection + body scroll-lock for iPhone fullscreen
  useEffect(() => {
    const lockBody = () => {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    };
    const unlockBody = () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
    const check = () => {
      // Landscape on mobile OR desktop (≥ 900px width) → use TV layout
      const land = window.innerWidth > window.innerHeight || window.innerWidth >= 900;
      setIsLandscape(land);
      if (land) lockBody(); else unlockBody();
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
      unlockBody();
    };
  }, []);

  // ── Auto-advance countdown when leaderboard shows ────────────────────────
  useEffect(() => {
    if (phase !== "leaderboard" || autoAdvanceSecs === 0) {
      if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
      setAutoAdvanceCountdown(0);
      return;
    }
    setAutoAdvanceCountdown(autoAdvanceSecs);
    let remaining = autoAdvanceSecs;
    if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
    autoAdvanceRef.current = setInterval(() => {
      remaining -= 1;
      setAutoAdvanceCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(autoAdvanceRef.current!);
        goNext();
      }
    }, PARTY_POLL_MS);
    return () => { if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch players ────────────────────────────────────────────────────────
  const fetchPlayers = useCallback(async (code: string) => {
    const { data } = await supabase
      .from("party_players")
      .select("id, room_code, nickname, score, answered_current, last_answer, answered_at")
      .eq("room_code", code)
      .order("score", { ascending: false });
    if (data) {
      const rows = data as PartyPlayer[];
      setPlayers(rows);
    }
  }, []);

  // ── Poll for player updates in lobby/reveal ───────────────────────────────
  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (phaseRef.current === "lobby" || phaseRef.current === "reveal" || phaseRef.current === "leaderboard") {
        fetchPlayers(code);
      }
    }, PARTY_POLL_MS);
  }

  function startHostHeartbeat(code: string) {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatFailuresRef.current = 0;
    heartbeatRef.current = setInterval(async () => {
      const { data, error: heartbeatError } = await supabase.rpc("heartbeat_party_host", {
        p_room_code: code,
        p_host_token: hostTokenRef.current,
      });
      if (heartbeatError) {
        heartbeatFailuresRef.current += 1;
        if (heartbeatFailuresRef.current === 3) {
          const message = "تعذر تأكيد اتصال المضيف. نحاول إعادة الاتصال دون إعادة ضبط الغرفة.";
          setError(message);
          setHostConnectionLost(true);
        }
        return;
      }
      heartbeatFailuresRef.current = 0;
      setHostConnectionLost(false);
      const status = Array.isArray(data) ? data[0] : data;
      if (status === "finished") {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        if (phaseRef.current !== "finished") {
          await fetchPlayers(code);
          phaseRef.current = "finished";
          setPhase("finished");
        }
      }
    }, 10000);
  }

  function subscribeToRoom(code: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel("host-room:" + code)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_players" },
        () => {
          if (phaseRef.current === "lobby") playSound("coin");
          fetchPlayers(code);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "party_players" },
        () => {
          if (["question", "reveal", "leaderboard"].includes(phaseRef.current)) fetchPlayers(code);
        })
      .subscribe();
  }

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const stored = parsePartyHostSession(sessionStorage.getItem(PARTY_HOST_SESSION_KEY));
      if (!stored) {
        sessionStorage.removeItem(PARTY_HOST_SESSION_KEY);
        return;
      }
      const { data, error: resumeError } = await supabase.rpc("resume_party_host", {
        p_room_code: stored.roomCode,
        p_host_token: stored.token,
      });
      const resumed = Array.isArray(data) ? data[0] : data;
      if (cancelled) return;
      if (resumeError) {
        setError(`تعذر استعادة الغرفة: ${resumeError.message}`);
        return;
      }
      if (!resumed || typeof resumed !== "object") {
        sessionStorage.removeItem(PARTY_HOST_SESSION_KEY);
        return;
      }
      const row = resumed as {
        code: string; status: HostPhase; category: string; total_questions: number;
        current_question: number; answer_time: number; show_question_on_phone: boolean;
        scoring_type: "speed" | "equal"; auto_advance_seconds: number;
        question_start_time: number; settled_question_index: number;
      };
      if (!["lobby", "question", "reveal", "leaderboard", "finished"].includes(row.status)) {
        sessionStorage.removeItem(PARTY_HOST_SESSION_KEY);
        return;
      }
      codeRef.current = row.code;
      hostTokenRef.current = stored.token;
      startHostHeartbeat(row.code);
      currentQIdxRef.current = row.current_question;
      answerTimeRef.current = row.answer_time;
      scoringTypeRef.current = row.scoring_type;
      phaseRef.current = row.status;
      questionStartMsRef.current = Number(row.question_start_time) || 0;
      setRoomCode(row.code);
      setCategory(row.category);
      setQuestionCount(row.total_questions);
      setCurrentQIdx(row.current_question);
      setAnswerTime(row.answer_time);
      setShowQuestionOnPhone(row.show_question_on_phone);
      setScoringType(row.scoring_type);
      setAutoAdvanceSecs(row.auto_advance_seconds ?? 0);
      setQuestionStartTime(questionStartMsRef.current);
      const qs = (await getPartyQuestions(row.code, row.category, row.total_questions))
        .map(q => shuffleQuestion(q, q.id));
      if (cancelled) return;
      partyQsRef.current = qs;
      setPartyQs(qs);
      setPhase(row.status);
      if (row.status === "reveal") {
        const resumedQuestion = qs[row.current_question];
        if (!resumedQuestion) {
          setError("تعذر استعادة سؤال الكشف.");
          return;
        }
        const settlementDecision = partySettlementResumeDecision(
          row.status,
          row.current_question,
          row.settled_question_index,
        );
        if (settlementDecision === "settle-reveal") {
          const settled = await settlePartyQuestion(
            row.code,
            row.current_question,
            resumedQuestion.correct,
          );
          if (!settled || cancelled) return;
        }
        await fetchPlayers(row.code);
        if (cancelled) return;
        scheduleRevealToLeaderboard(row.code, row.current_question);
      } else {
        await fetchPlayers(row.code);
      }
      subscribeToRoom(row.code);
      if (["lobby", "reveal", "leaderboard"].includes(row.status)) startPolling(row.code);
      if (row.status === "question") {
        startTimer(row.current_question, questionStartMsRef.current);
        startAnswerPolling(row.code);
      }
    };
    void restore()
      .catch(() => setError("تعذر استعادة الغرفة. تحقق من الاتصال ثم أعد تحميل الصفحة."))
      .finally(() => { if (!cancelled) setRestoringSession(false); });
    return () => { cancelled = true; };
    // Resume exactly once; referenced functions use refs for current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create room ──────────────────────────────────────────────────────────
  async function createRoom() {
    setCreating(true);
    setError("");
    const code = generateCode();
    codeRef.current = code;
    hostTokenRef.current = crypto.randomUUID();

    // Sync refs so closures use current settings
    answerTimeRef.current = answerTime;
    scoringTypeRef.current = scoringType;

    const { error: err } = await supabase.rpc("create_party_room", {
      p_room_code: code,
      p_category: category,
      p_total_questions: questionCount,
      p_answer_time: answerTime,
      p_show_question_on_phone: showQuestionOnPhone,
      p_scoring_type: scoringType,
      p_auto_advance_seconds: autoAdvanceSecs,
      p_host_token: hostTokenRef.current,
    });
    if (err) {
      setError("خطأ في إنشاء الغرفة: " + err.message);
      codeRef.current = "";
      hostTokenRef.current = "";
      setCreating(false);
      return;
    }
    sessionStorage.setItem(PARTY_HOST_SESSION_KEY, serializePartyHostSession({
      role: "host",
      roomCode: code,
      token: hostTokenRef.current,
    }));
    startHostHeartbeat(code);

    const qs = await getPartyQuestions(code, category, questionCount);
    // Deterministic shuffle by q.id so host + all guests see identical option order
    const sq = qs.map((q) => shuffleQuestion(q, q.id));
    setPartyQs(sq);
    partyQsRef.current = sq;
    setRoomCode(code);

    subscribeToRoom(code);

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
    // Lock in total_players count at game start — guests' join won't change it mid-game
    const { error: lockError } = await supabase.rpc("set_party_total_players", {
      p_room_code: codeRef.current,
      p_total_players: players.length,
      p_host_token: hostTokenRef.current,
    });
    if (lockError) {
      const message = `تعذر تثبيت عدد اللاعبين: ${lockError.message}`;
      setError(message);
      alert(message);
      return;
    }
    await goToQuestion(0);
  }

  // ── Transition to a specific question ────────────────────────────────────
  async function goToQuestion(qIdx: number) {
    // Stop any active answer-poll and timers
    if (answerPollRef.current) clearInterval(answerPollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    clearTransitionTimeouts();

    // Reset guards
    revealCalledRef.current = false;
    setAllAnsweredAlert(false);

    // Reset answers and publish the question atomically using the DB clock.
    const roomCode = codeRef.current;
    const { data: rpcData, error: rpcError } = await supabase.rpc("start_party_question", {
      p_room_code: roomCode,
      p_question_index: qIdx,
      p_host_token: hostTokenRef.current,
    });
    const rawStart = Array.isArray(rpcData)
      ? (rpcData[0] as { start_party_question?: unknown } | number | string | undefined)
      : rpcData;
    const startValue = typeof rawStart === "object" && rawStart !== null
      ? rawStart.start_party_question
      : rawStart;
    const questionStartMs = Number(startValue);
    if (rpcError || !Number.isFinite(questionStartMs) || questionStartMs <= 0) {
      const message = `تعذر بدء السؤال: ${rpcError?.message ?? "وقت بدء غير صالح من الخادم"}`;
      setError(message);
      alert(message);
      return;
    }

    // Small propagation delay, then use the exact timestamp returned by the DB.
    await new Promise(r => setTimeout(r, 300));
    if (codeRef.current !== roomCode) return;

    questionStartMsRef.current = questionStartMs;
    currentQIdxRef.current = qIdx;
    setCurrentQIdx(qIdx);
    setQuestionStartTime(questionStartMs);
    phaseRef.current = "question";
    setPhase("question");
    void fetchPlayers(codeRef.current);

    // Step 5 – Start the visual countdown
    startTimer(qIdx, questionStartMs);

    // Step 6 – Poll DB directly (not stale React state) every 1s to check all answered
    startAnswerPolling(codeRef.current);
  }

  // ── Poll DB for answered count (avoids stale React state entirely) ────────
  function startAnswerPolling(code: string) {
    if (answerPollRef.current) clearInterval(answerPollRef.current);
    answerPollRef.current = setInterval(async () => {
      // Stop polling if we've moved on
      if (phaseRef.current !== "question" || revealCalledRef.current) {
        clearInterval(answerPollRef.current!);
        return;
      }
      try {
        // Fresh count directly from DB — no stale React state
        const { count: answeredCount } = await supabase
          .from("party_players")
          .select("id", { count: "exact", head: true })
          .eq("room_code", code)
          .eq("answered_current", true);

        const { data: roomRow } = await supabase
          .from("party_rooms")
          .select("total_players")
          .eq("code", code)
          .single();

        const total = roomRow?.total_players ?? 0;

        // Also update the displayed player list for the answered counter
        if (answeredCount !== null && answeredCount > 0) {
          fetchPlayers(code);
        }

        if (answeredCount !== null && total > 0 && answeredCount >= total) {
          clearInterval(answerPollRef.current!);
          revealCalledRef.current = true;
          if (timerRef.current) clearInterval(timerRef.current);
          setAllAnsweredAlert(true);
          if (allAnsweredDelayRef.current) clearTimeout(allAnsweredDelayRef.current);
          const lockedQuestionIdx = currentQIdxRef.current;
          allAnsweredDelayRef.current = setTimeout(() => {
            allAnsweredDelayRef.current = null;
            if (
              codeRef.current !== code ||
              phaseRef.current !== "question" ||
              currentQIdxRef.current !== lockedQuestionIdx
            ) return;
            setAllAnsweredAlert(false);
            revealAnswers(lockedQuestionIdx);
          }, ALL_ANSWERED_DELAY_MS);
        }
      } catch { /* network hiccup, retry next tick */ }
    }, PARTY_POLL_MS);
  }

  // ── Timer ────────────────────────────────────────────────────────────────
  function startTimer(qIdx: number, startMs: number) {
    const totalSec = answerTimeRef.current;
    setTimeLeft(totalSec);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const remaining = Math.max(0, totalSec - Math.floor(elapsed));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0) playSound("tick");
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        if (!revealCalledRef.current) {
          revealAnswers(qIdx);
        }
      }
    }, 500);
  }

  // NOTE: All-answered auto-advance is now handled by startAnswerPolling()
  // which queries the DB directly every 1s — no more stale React state issues.

  async function settlePartyQuestion(code: string, qIdx: number, correctAnswer: number) {
    const { data, error: settlementError } = await supabase.rpc("settle_party_question", {
      p_room_code: code,
      p_question_index: qIdx,
      p_correct_answer: correctAnswer,
      p_host_token: hostTokenRef.current,
    });
    const result = Array.isArray(data) ? data[0] : data;
    const settled = !!(
      result &&
      typeof result === "object" &&
      "settled" in result &&
      result.settled
    );
    if (settlementError || !settled) {
      const message = `تعذر احتساب الجولة: ${settlementError?.message ?? "استجابة غير صالحة من الخادم"}`;
      setError(message);
      alert(message);
      return false;
    }
    return true;
  }

  function scheduleRevealToLeaderboard(revealCode: string, revealQuestionIdx: number) {
    if (revealLeaderboardTimeoutRef.current) clearTimeout(revealLeaderboardTimeoutRef.current);
    revealLeaderboardTimeoutRef.current = setTimeout(async () => {
      revealLeaderboardTimeoutRef.current = null;
      if (
        codeRef.current !== revealCode ||
        phaseRef.current !== "reveal" ||
        currentQIdxRef.current !== revealQuestionIdx
      ) return;
      const { error: leaderboardError } = await supabase.rpc("set_party_room_status", {
        p_room_code: revealCode,
        p_status: "leaderboard",
        p_host_token: hostTokenRef.current,
      });
      if (leaderboardError) {
        const message = `تعذر عرض الترتيب: ${leaderboardError.message}`;
        setError(message);
        alert(message);
        return;
      }
      if (codeRef.current !== revealCode || phaseRef.current !== "reveal") return;
      await fetchPlayers(revealCode);
      phaseRef.current = "leaderboard";
      setPhase("leaderboard");
    }, REVEAL_DURATION_MS);
  }

  // ── Atomically settle and reveal answers ─────────────────────────────────
  const revealAnswers = useCallback(async (qIdx: number) => {
    if (phaseRef.current === "reveal") return;
    revealCalledRef.current = true; // lock in case timer fires after all-answered
    if (timerRef.current) clearInterval(timerRef.current);

    const revealCode = codeRef.current;
    const q = partyQsRef.current[qIdx];
    if (!q || !await settlePartyQuestion(revealCode, qIdx, q.correct)) {
      revealCalledRef.current = false;
      return;
    }
    phaseRef.current = "reveal";
    setPhase("reveal");
    playSound("gameover");
    await fetchPlayers(revealCode);
    scheduleRevealToLeaderboard(revealCode, qIdx);
  }, [fetchPlayers]);

  // ── Next question / finish ───────────────────────────────────────────────
  async function goNext() {
    const nextIdx = currentQIdxRef.current + 1;
    if (nextIdx >= partyQsRef.current.length) {
      const { error: finishError } = await supabase.rpc("set_party_room_status", {
        p_room_code: codeRef.current,
        p_status: "finished",
        p_host_token: hostTokenRef.current,
      });
      if (finishError) {
        const message = `تعذر إنهاء اللعبة: ${finishError.message}`;
        setError(message);
        alert(message);
        return;
      }
      await fetchPlayers(codeRef.current);
      phaseRef.current = "finished";
      setPhase("finished");
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      playSound("gameover");
    } else {
      await goToQuestion(nextIdx);
    }
  }

  // Play a victory fanfare when the game wraps up
  useEffect(() => {
    if (phase === "finished") {
      playSound("levelup");
      fanfareTimeoutRef.current = setTimeout(() => {
        fanfareTimeoutRef.current = null;
        if (phaseRef.current === "finished") playSound("achievement");
      }, 600);
    }
    return () => {
      if (fanfareTimeoutRef.current) clearTimeout(fanfareTimeoutRef.current);
      fanfareTimeoutRef.current = null;
    };
  }, [phase]);

  // ── Derived values ───────────────────────────────────────────────────────
  const currentQ = partyQs[currentQIdx] ?? null;
  const answeredCount = players.filter(p => p.answered_current).length;
  const timerPct = (timeLeft / (answerTimeRef.current || 20)) * 100;
  const isDanger = timeLeft <= 5;
  const sorted = [...players].sort((a, b) => b.score - a.score);

  // Answer distribution for reveal
  const answerCounts = currentQ
    ? [0, 1, 2, 3].map(idx => players.filter(p => p.last_answer === idx).length)
    : [0, 0, 0, 0];
  const maxCount = Math.max(...answerCounts, 1);
  const HostConnectionBanner = () => hostConnectionLost ? (
    <div className="fixed inset-x-3 top-3 z-[100] rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-center text-sm font-bold text-amber-100 shadow-xl" role="status">
      تعذر تأكيد اتصال المضيف — نحاول إعادة الاتصال دون إعادة ضبط الغرفة
    </div>
  ) : null;

  // ── SETUP ────────────────────────────────────────────────────────────────
  if (restoringSession) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center" aria-live="polite">
        <p className="font-bold text-muted-foreground animate-pulse motion-reduce:animate-none">جارٍ استعادة الغرفة...</p>
      </div>
    );
  }

  if (phase === "setup") {
    const user = getOrCreateUser();
    const isPremium = user.isPremium;
    return (
      <div className="party-setup-container gradient-hero flex flex-col p-5 gap-5 pb-8" style={{ minHeight: "100vh", maxHeight: "100vh", overflowY: "auto" }}>
        <HostConnectionBanner />
        <header className="flex items-center gap-3">
          <button onClick={() => navigate("/party")} className="text-muted-foreground text-xl">←</button>
          <h1 className="text-lg font-black">📺 إعداد اللعبة</h1>
        </header>

        <div className="space-y-4">

          {/* Category */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground font-bold mb-3">🎲 الفئة</p>
            <CategoryPicker
              onSelect={(id) => setCategory(id)}
              isPremium={isPremium}
              includeMix={true}
              size="small"
              selectedIds={[category]}
              multiSelect={true}
              onToggle={(id) => setCategory(id)}
              initialParent={category}
            />
          </div>

          {/* Question count */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground font-bold mb-3">🎯 عدد الأسئلة</p>
            <div className="flex gap-2">
              {[5, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setQuestionCount(n)}
                  className={`flex-1 h-11 rounded-xl font-black text-base border transition-all ${questionCount === n ? "bg-primary text-background border-primary" : "bg-background border-border text-foreground"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Answer time */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground font-bold mb-3">⏱️ وقت الإجابة (ثانية)</p>
            <div className="flex gap-2 flex-wrap">
              {[5, 10, 15, 20, 30, 60].map(n => (
                <button key={n} onClick={() => setAnswerTime(n)}
                  className={`flex-1 min-w-[44px] h-11 rounded-xl font-black text-base border transition-all ${answerTime === n ? "bg-primary text-background border-primary" : "bg-background border-border text-foreground"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Show question on phone */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold">📱 إظهار السؤال على الجوال</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {showQuestionOnPhone ? "اللاعبون يرون السؤال على هواتفهم" : "وضع كاهوت — انظر للشاشة الكبيرة"}
                </p>
              </div>
              <button
                onClick={() => setShowQuestionOnPhone(v => !v)}
                className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors duration-200 ${showQuestionOnPhone ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showQuestionOnPhone ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* Scoring type */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground font-bold mb-3">🏆 نظام النقاط</p>
            <div className="flex gap-3">
              <button onClick={() => setScoringType("speed")}
                className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${scoringType === "speed" ? "bg-primary text-background border-primary" : "bg-background border-border text-foreground"}`}>
                <div>⚡ سريع</div>
                <div className="text-xs font-normal opacity-70 mt-0.5">الأسرع يحصل أكثر</div>
              </button>
              <button onClick={() => setScoringType("equal")}
                className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${scoringType === "equal" ? "bg-primary text-background border-primary" : "bg-background border-border text-foreground"}`}>
                <div>⚖️ عادل</div>
                <div className="text-xs font-normal opacity-70 mt-0.5">الكل يحصل 1000</div>
              </button>
            </div>
          </div>

          {/* Auto-advance */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground font-bold mb-3">⏩ انتقال تلقائي بعد النتائج</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "يدوي", value: 0 },
                { label: "3ث", value: 3 },
                { label: "5ث", value: 5 },
                { label: "10ث", value: 10 },
              ].map(opt => (
                <button key={opt.value} onClick={() => setAutoAdvanceSecs(opt.value)}
                  className={`flex-1 h-11 rounded-xl font-bold text-sm border transition-all ${autoAdvanceSecs === opt.value ? "bg-primary text-background border-primary" : "bg-background border-border text-foreground"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {autoAdvanceSecs === 0 ? "المضيف يضغط يدوياً للمتابعة" : `ينتقل تلقائياً بعد ${autoAdvanceSecs} ثانية من الترتيب`}
            </p>
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
      <div className="min-h-screen gradient-hero flex flex-col p-4 sm:p-6 gap-5 overflow-y-auto">
        <HostConnectionBanner />
        <header className="flex items-center gap-3">
          <h1 className="text-lg font-black text-primary">📺 غرفة الانتظار</h1>
          <button onClick={() => fetchPlayers(roomCode)} data-testid="button-refresh-party-players" aria-label="تحديث اللاعبين" className="mr-auto min-w-11 min-h-11 rounded-xl bg-card border border-border text-foreground text-base">🔄</button>
        </header>

        {/* Big room code */}
        <div className="glass-card p-6 text-center" style={{ boxShadow: "0 12px 40px rgba(212,175,55,0.25), inset 0 0 32px rgba(212,175,55,0.08)", border: "1.5px solid rgba(212,175,55,0.4)" }}>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">رمز الغرفة</p>
          <p
            className="font-black tracking-[0.2em] tabular-nums pulse-glow gradient-text leading-none"
            data-testid="text-party-room-code"
            dir="ltr"
            style={{
              fontSize: "clamp(4rem, 18vw, 8rem)",
              filter: "drop-shadow(0 0 24px rgba(245,158,11,0.55))",
            }}
          >{roomCode}</p>
          <p className="text-xs text-muted-foreground mt-3">وضع التجمعات ← انضم للغرفة</p>
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => navigator.clipboard?.writeText(roomCode)}
              data-testid="button-copy-party-code"
              className="min-h-11 px-4 py-2 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              📋 نسخ الرمز
            </button>
            <button
              onClick={async () => {
                const joinUrl = new URL(
                  `party/guest?code=${roomCode}`,
                  new URL(import.meta.env.BASE_URL, window.location.origin),
                ).href;
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: "انضم إلى ميدان!",
                      text: `انضم إلى غرفة التحدي برمز: ${roomCode}`,
                      url: joinUrl,
                    });
                  } catch (err) {
                    if (!(err instanceof Error && err.name === "AbortError")) {
                      await navigator.clipboard?.writeText(joinUrl);
                      setShareFeedback("copied");
                      setTimeout(() => setShareFeedback(null), 2000);
                    }
                  }
                } else {
                  await navigator.clipboard?.writeText(joinUrl);
                  setShareFeedback("copied");
                  setTimeout(() => setShareFeedback(null), 2000);
                }
              }}
              data-testid="button-share-party-room"
              className="min-h-11 px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
              style={{ background: "linear-gradient(135deg,#7c3aed22,#d97706aa)", borderColor: "#d97706aa", color: "#f59e0b" }}
            >
              {shareFeedback === "copied" ? "✅ تم النسخ!" : "🔗 مشاركة الرابط"}
            </button>
          </div>

          {/* QR Code */}
          <div className="mt-5 flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-2xl shadow-2xl" style={{ boxShadow: "0 8px 28px rgba(212,175,55,0.35)" }}>
              <QRCodeSVG
                value={new URL(
                  `party/guest?code=${roomCode}`,
                  new URL(import.meta.env.BASE_URL, window.location.origin),
                ).href}
                size={180}
                level="M"
              />
            </div>
            <p className="text-xs text-muted-foreground">امسح الكود للانضمام 📱</p>
          </div>
        </div>

        {/* Settings summary */}
        <div className="flex gap-2 justify-center flex-wrap">
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            {category === "mix" ? "🌐 مزيج" : `${CATEGORIES.find(c => c.id === category)?.icon || ""} ${CATEGORIES.find(c => c.id === category)?.name || ""}`}
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            🎯 {questionCount} سؤال
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            ⏱️ {answerTime}ث
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted-foreground">
            {scoringType === "speed" ? "⚡ سريع" : "⚖️ عادل"}
          </span>
          {showQuestionOnPhone && (
            <span className="text-xs px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary">
              📱 سؤال على الجوال
            </span>
          )}
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
              <p className="text-5xl mb-3 animate-bounce">⌛</p>
              <p className="text-base font-bold animate-pulse">في انتظار اللاعبين...</p>
              <p className="text-xs mt-2 opacity-70">شارك رمز الغرفة مع الأصدقاء 📱</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 fade-in-up hover:border-primary/40 transition-colors"
                  style={{ animationDelay: `${(i % 8) * 60}ms` }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-background shrink-0"
                    style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                  >
                    {i < 3 ? MEDALS[i] : (p.nickname.charAt(0) || "؟")}
                  </span>
                  <span className="font-bold text-sm min-w-0 break-words [overflow-wrap:anywhere]">{p.nickname}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={startGame}
          disabled={players.length < 1}
          data-testid="button-start-party-game"
          className="w-full h-16 rounded-2xl text-background font-black text-xl disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg,#d97706,#f59e0b)",
            boxShadow: players.length >= 1 ? "0 8px 28px rgba(245,158,11,0.4)" : "none",
          }}
        >
          🚀 ابدأ اللعبة {players.length > 0 && `(${players.length} ${players.length === 1 ? "لاعب" : "لاعبين"})`}
        </button>
      </div>
    );
  }

  // ── QUESTION (TV screen) ─────────────────────────────────────────────────
  if (phase === "question" && currentQ) {
    const AnswerBoxes = () => (
      <div className="grid grid-cols-2 gap-2">
        {ANSWER_COLORS.map((color, idx) => (
          <div key={idx}
            className="rounded-2xl flex flex-col items-center justify-center p-3 text-white font-black text-center"
            style={{ background: `linear-gradient(135deg,${color.bg},${color.dark})`, minHeight: isLandscape ? "15vh" : "90px" }}>
            <span style={{ fontSize: isLandscape ? "1.5rem" : "1.5rem" }}>{color.emoji}</span>
            <span className="break-words [overflow-wrap:anywhere] max-w-full" style={{ fontSize: isLandscape ? "0.9rem" : "0.9rem", marginTop: "4px", lineHeight: 1.2 }}>{currentQ.options[idx]}</span>
          </div>
        ))}
      </div>
    );

    if (isLandscape) {
      // ── LANDSCAPE / TV layout ─────────────────────────────────────────────
      return (
        <div className="landscape-host" data-testid="status-host-question" style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          width: "100dvw", height: "100dvh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          background: "hsl(220 20% 8%)",
        }}>
          {/* All-answered banner */}
          {allAnsweredAlert && (
            <div style={{ position: "absolute", top: 12, left: 0, right: 0, zIndex: 50, display: "flex", justifyContent: "center" }}>
              <div style={{ background: "#22c55e", color: "white", padding: "10px 28px", borderRadius: 16, fontWeight: 900, fontSize: "1.2rem", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
                أجاب الجميع! 🎉
              </div>
            </div>
          )}

          {/* Top row: question (60%) + info panel (40%) */}
          <div style={{ display: "flex", flex: "0 0 auto", height: "45vh", gap: 12, padding: "12px 12px 6px" }}>
            {/* Question text — 60% */}
            <div style={{
              flex: "0 0 60%",
              background: "hsl(220 18% 11%)",
              border: "1px solid hsl(220 15% 18%)",
              borderRadius: 20,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "16px 24px", textAlign: "center", gap: 12, overflow: "hidden",
            }}>
              {currentQ.image_url && (
                <QuestionImage url={currentQ.image_url} maxHeight={300} className="w-full" />
              )}
              <p style={{ fontSize: "clamp(1.1rem, 2.5vw, 2rem)", fontWeight: 900, lineHeight: 1.4, color: "hsl(45 90% 92%)" }}>
                {currentQ.question}
              </p>
            </div>

            {/* Timer + info — 40% */}
            <div style={{
              flex: "0 0 40%",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 12,
            }}>
              {/* Big circular timer */}
              <CircularTimer
                timeLeft={timeLeft}
                totalTime={answerTimeRef.current || 20}
                size={140}
                strokeWidth={10}
              />
              {/* Answered count */}
              <div style={{
                padding: "8px 20px", borderRadius: 12, fontWeight: 700, fontSize: "1rem",
                background: answeredCount === players.length ? "rgba(34,197,94,0.15)" : "hsl(220 18% 11%)",
                border: `1px solid ${answeredCount === players.length ? "rgba(34,197,94,0.4)" : "hsl(220 15% 18%)"}`,
                color: answeredCount === players.length ? "#4ade80" : "hsl(45 40% 60%)",
              }}>
                {answeredCount}/{players.length} أجابوا
              </div>
              {/* Question number */}
              <div style={{ fontSize: "0.8rem", color: "hsl(45 40% 50%)", fontWeight: 700 }}>
                سؤال {currentQIdx + 1} / {partyQs.length}
              </div>
              {/* Skip */}
              <button onClick={() => {
                if (!revealCalledRef.current) {
                  revealCalledRef.current = true;
                  if (timerRef.current) clearInterval(timerRef.current);
                  revealAnswers(currentQIdx);
                }
              }} style={{
                padding: "6px 16px", borderRadius: 10, border: "1px solid hsl(220 15% 18%)",
                background: "hsl(220 18% 11%)", color: "hsl(45 40% 60%)", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
              }}>
                ⏭️ تخطى
              </button>
            </div>
          </div>

          {/* Bottom: 4 answer boxes */}
          <div style={{ flex: 1, padding: "6px 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {ANSWER_COLORS.map((color, idx) => (
              <div key={idx}
                style={{
                  borderRadius: 16,
                  display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 12, padding: "8px 16px", fontWeight: 900, textAlign: "center",
                  background: `linear-gradient(135deg,${color.bg},${color.dark})`,
                }}>
                <span style={{ fontSize: "1.8rem" }}>{color.emoji}</span>
                <span style={{ color: "white", fontSize: "clamp(0.8rem, 1.8vw, 1.1rem)", lineHeight: 1.3, overflowWrap: "anywhere" }}>{currentQ.options[idx]}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── PORTRAIT layout ───────────────────────────────────────────────────
    return (
      <div className="min-h-screen gradient-hero flex flex-col" data-testid="status-host-question">
        <HostConnectionBanner />
        {/* All-answered celebration banner */}
        {allAnsweredAlert && (
          <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
            <div className="bg-green-500 text-white px-6 py-3 rounded-2xl font-black text-lg shadow-2xl animate-bounce">
              أجاب الجميع! 🎉
            </div>
          </div>
        )}

        {/* Header */}
        <header className="p-3 border-b border-border/30">
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-muted-foreground font-bold px-2 py-1 bg-card rounded-lg shrink-0">
              {currentQIdx + 1} / {partyQs.length}
            </span>
            <CircularTimer
              timeLeft={timeLeft}
              totalTime={answerTimeRef.current || 20}
              size={88}
              strokeWidth={7}
            />
            <span
              className={`text-xs px-2 py-1 rounded-lg font-bold shrink-0 ${
                players.length > 0 && answeredCount === players.length
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-card text-muted-foreground"
              }`}
            >
              {answeredCount}/{players.length} أجابوا
            </span>
          </div>
          {/* Slim answered-progress bar (replaces redundant timer bar) */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all duration-500 ease-linear"
              style={{
                width: `${players.length > 0 ? (answeredCount / players.length) * 100 : 0}%`,
                background: "linear-gradient(90deg,#22c55e,#16a34a)",
              }}
            />
          </div>
        </header>

        {/* Question */}
        <div className="px-4 py-5">
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            {currentQ.image_url && (
              <QuestionImage url={currentQ.image_url} maxHeight={200} className="mb-3" />
            )}
            <p className="text-xl font-black leading-relaxed break-words [overflow-wrap:anywhere]">{currentQ.question}</p>
          </div>
        </div>

        {/* 4 colored answer boxes */}
        <div className="flex-1 px-4 pb-4">
          <AnswerBoxes />
        </div>

        {/* Skip button */}
        <div className="p-4 border-t border-border/30 tv-skip">
          <button onClick={() => {
            if (!revealCalledRef.current) {
              revealCalledRef.current = true;
              if (timerRef.current) clearInterval(timerRef.current);
              revealAnswers(currentQIdx);
            }
          }}
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
      <div className="min-h-screen gradient-hero flex flex-col p-4 sm:p-6 gap-5 overflow-y-auto">
        <HostConnectionBanner />
        <div className="text-center fade-in-up" data-testid="status-host-reveal" aria-live="polite">
          <p className="text-4xl mb-1">✨</p>
          <h2 className="text-xl font-black text-primary">كشف الإجابة</h2>
          <p className="text-xs font-bold text-muted-foreground mt-1">شاهد توزيع اختيارات اللاعبين</p>
        </div>

        {/* Answer boxes with highlight */}
        <div className="grid grid-cols-2 gap-3">
          {ANSWER_COLORS.map((color, idx) => {
            const isCorrect = idx === currentQ.correct;
            const count = answerCounts[idx];
            const barPct = (count / maxCount) * 100;
            return (
              <div key={idx} className="rounded-2xl overflow-hidden min-w-0"
                data-testid={`card-host-reveal-answer-${idx}`}
                style={{ background: isCorrect ? `linear-gradient(135deg,${color.bg},${color.dark})` : "hsl(var(--card))", border: isCorrect ? "none" : "2px solid hsl(var(--border))", opacity: isCorrect ? 1 : 0.4 }}>
                <div className="p-3 text-center">
                  <span className="text-xl">{color.emoji}</span>
                  <p className={`text-sm font-bold mt-1 break-words [overflow-wrap:anywhere] ${isCorrect ? "text-white" : "text-muted-foreground"}`}>
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
              <div key={p.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5" data-testid={`row-host-reveal-leader-${i + 1}`}>
                <span className="text-xl">{MEDALS[i]}</span>
                <span className="font-bold text-sm flex-1 min-w-0 break-words [overflow-wrap:anywhere]">{p.nickname}</span>
                <span className="font-black text-primary">{p.score} نقطة</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground animate-pulse motion-reduce:animate-none" data-testid="status-host-reveal-transition">جاري الانتقال للترتيب...</p>
      </div>
    );
  }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    const isLastQuestion = currentQIdx >= partyQs.length - 1;
    return (
      <div className="min-h-screen gradient-hero flex flex-col p-4 sm:p-6 gap-5 overflow-y-auto">
        <HostConnectionBanner />
        <h2 className="text-center text-2xl font-black text-primary" data-testid="status-host-leaderboard">🏆 الترتيب الآن</h2>
        <p className="text-center text-xs text-muted-foreground">سؤال {currentQIdx + 1} من {partyQs.length}</p>

        <div className="flex-1 space-y-2">
          {sorted.slice(0, 5).map((p, i) => (
            <div key={p.id} data-testid={`row-host-leaderboard-${i + 1}`}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                i === 1 ? "bg-slate-400/10 border-slate-400/20" :
                i === 2 ? "bg-orange-700/10 border-orange-700/20" :
                "bg-card border-border"
              }`}>
              <span className="text-2xl">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className="flex-1 min-w-0 font-bold break-words [overflow-wrap:anywhere]">{p.nickname}</span>
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

        {autoAdvanceSecs > 0 ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full border-4 border-primary flex items-center justify-center">
              <span className="text-3xl font-black text-primary tabular-nums" data-testid="text-host-auto-advance-countdown">{autoAdvanceCountdown}</span>
            </div>
            <p className="text-xs text-muted-foreground">انتقال تلقائي...</p>
          </div>
        ) : (
          <button onClick={goNext} data-testid="button-host-next-question"
            className="w-full h-14 rounded-2xl text-white font-black text-lg"
            style={{ background: isLastQuestion ? "linear-gradient(135deg,#d97706,#f59e0b)" : "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            {isLastQuestion ? "🏁 إنهاء اللعبة" : "▶ السؤال التالي"}
          </button>
        )}
      </div>
    );
  }

  // ── FINISHED (podium + confetti) ──────────────────────────────────────────
  if (phase === "finished") {
    const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const shareText = `🎉 انتهت لعبة ميدان!\n🥇 الفائز: ${sorted[0]?.nickname || "-"}\n🏆 الأعلى: ${sorted[0]?.score || 0} نقطة\nجرب أنت أيضاً!\n${appUrl}`;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-6 gap-6 text-center relative overflow-x-hidden overflow-y-auto">
        <HostConnectionBanner />
        <Confetti />

        <div className="fade-in-up z-10" data-testid="status-host-party-finished" aria-live="assertive">
          <p className="text-6xl mb-2">🏆</p>
          <h1 className="text-3xl font-black text-primary">انتهت اللعبة!</h1>
        </div>

        {/* Podium — top 3 */}
        {sorted.length >= 1 && (
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-4 z-10 w-full max-w-md" data-testid="podium-host-final">
            {/* 2nd place */}
            {sorted[1] && (
              <div className="flex flex-col items-center gap-1 min-w-0">
                <span className="text-3xl">🥈</span>
                <div className="bg-slate-400/20 border border-slate-400/30 rounded-t-xl px-2 py-2 h-24 w-full flex flex-col items-center justify-end">
                  <p className="font-black text-sm w-full break-words [overflow-wrap:anywhere]">{sorted[1].nickname}</p>
                  <p className="text-primary font-bold text-xs">{sorted[1].score}</p>
                </div>
              </div>
            )}
            {/* 1st place */}
            <div className="flex flex-col items-center gap-1 min-w-0">
              <span className="text-4xl">🥇</span>
              <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-t-xl px-2 py-2 h-32 w-full flex flex-col items-center justify-end shadow-lg shadow-yellow-500/10">
                <p className="font-black text-base w-full break-words [overflow-wrap:anywhere]">{sorted[0]?.nickname}</p>
                <p className="text-primary font-bold text-sm">{sorted[0]?.score}</p>
              </div>
            </div>
            {/* 3rd place */}
            {sorted[2] && (
              <div className="flex flex-col items-center gap-1 min-w-0">
                <span className="text-3xl">🥉</span>
                <div className="bg-orange-700/20 border border-orange-700/30 rounded-t-xl px-2 py-2 h-20 w-full flex flex-col items-center justify-end">
                  <p className="font-black text-sm w-full break-words [overflow-wrap:anywhere]">{sorted[2].nickname}</p>
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

        <div className="flex flex-wrap justify-center gap-3 z-10">
          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
            data-testid="button-share-party-results"
            className="px-5 py-3 rounded-xl text-white font-bold text-sm flex items-center gap-2"
            style={{ backgroundColor: "#25D366" }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            مشاركة
          </button>
          <button
            onClick={async () => {
              const oldCode = codeRef.current;
              const oldToken = hostTokenRef.current;
              const { error: deleteError } = await supabase.rpc("delete_party_room", {
                p_room_code: oldCode,
                p_host_token: oldToken,
              });
              if (deleteError) {
                const message = `تعذر حذف الغرفة السابقة: ${deleteError.message}`;
                setError(message);
                alert(message);
                return;
              }
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
              }
              sessionStorage.removeItem(PARTY_HOST_SESSION_KEY);
              setPhase("setup"); setPlayers([]); setRoomCode("");
              setCurrentQIdx(0); codeRef.current = ""; hostTokenRef.current = ""; phaseRef.current = "setup";
            }}
            data-testid="button-host-new-party"
            className="min-h-12 px-5 py-3 rounded-xl font-bold text-background text-sm"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
            لعبة جديدة
          </button>
          <button onClick={async () => {
            const { error: deleteError } = await supabase.rpc("delete_party_room", {
              p_room_code: codeRef.current,
              p_host_token: hostTokenRef.current,
            });
            if (deleteError) {
              const message = `تعذر مغادرة الغرفة: ${deleteError.message}`;
              setError(message);
              alert(message);
              return;
            }
            sessionStorage.removeItem(PARTY_HOST_SESSION_KEY);
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
            codeRef.current = "";
            hostTokenRef.current = "";
            navigate("/");
          }}
            className="px-5 py-3 rounded-xl font-bold bg-card border border-border text-foreground text-sm">
            الرئيسية
          </button>
        </div>
      </div>
    );
  }

  return null;
}
