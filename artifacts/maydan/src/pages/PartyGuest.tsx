import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Question } from "@/lib/questions";
import { fetchSeededQuestions } from "@/lib/questionService";
import { shuffleQuestion } from "@/lib/shuffle";
import QuestionImage from "@/components/QuestionImage";
import CircularTimer from "@/components/CircularTimer";
import { playSound } from "@/lib/sound";
import { useBackgroundMusic } from "@/lib/useBackgroundMusic";
import { flashScreen } from "@/lib/flash";
import {
  isCurrentPartyAnswerResponse,
  partyRoundPointsFromAcceptedResponse,
} from "@/lib/partyScoring";
import {
  PARTY_GUEST_SESSION_KEY,
  guestResumePhase,
  parsePartyGuestSession,
  serializePartyGuestSession,
  type ResumablePartyStatus,
} from "@/lib/partySession";

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
  question_start_time?: number | null;
}

interface PlayerRow {
  id: string;
  nickname: string;
  score: number;
  answered_current: boolean;
  last_answer: number | null;
}

const PARTY_ROOM_COLUMNS = "id, code, status, category, current_question, total_questions, answer_time, show_question_on_phone, scoring_type, question_start_time" as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_QUESTION_TIME = 20;
const MEDALS = ["🥇", "🥈", "🥉"];
const E2E_TIMING =
  import.meta.env.VITE_E2E_TIMING === "1" &&
  new URLSearchParams(window.location.search).has("__e2e");
const PARTY_POLL_MS = E2E_TIMING ? 100 : 1000;

const ANSWER_COLORS = [
  { bg: "#e74c3c", dark: "#c0392b", emoji: "🔴", label: "أ" },
  { bg: "#3498db", dark: "#2980b9", emoji: "🔵", label: "ب" },
  { bg: "#f39c12", dark: "#d68910", emoji: "🟡", label: "ج" },
  { bg: "#27ae60", dark: "#1e8449", emoji: "🟢", label: "د" },
];

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
  useBackgroundMusic("party");

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
  const [connectionLost, setConnectionLost] = useState(false);
  const [answerRejected, setAnswerRejected] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const consecutiveFailsRef = useRef(0);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMaintenanceAtRef = useRef(0);
  const myIdRef = useRef("");
  const playerTokenRef = useRef("");
  const phaseRef = useRef<GuestPhase>("enter_code");
  const questionStartRef = useRef(0);
  const currentQIdxRef = useRef(-1);
  const consecutiveRef = useRef(0);
  const answeringRef = useRef(false);
  const deadlineLockedRef = useRef(false);
  // Track last seen DB state to avoid re-triggering transitions on every poll tick
  const lastSeenRef = useRef({ status: "", qIdx: -1 });

  // Restore a capability-bound session before processing a QR/deep-link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code")?.replace(/\D/g, "");
    let cancelled = false;
    const restore = async () => {
      const stored = parsePartyGuestSession(sessionStorage.getItem(PARTY_GUEST_SESSION_KEY));
      const canRestore = stored && (!urlCode || urlCode === stored.roomCode);
      if (canRestore) {
        const maintenance = await maintainRoom(stored.roomCode, true);
        if (maintenance === "deleted" || maintenance === "missing") {
          sessionStorage.removeItem(PARTY_GUEST_SESSION_KEY);
          setErrorMsg("انتهت الغرفة وتم تنظيفها بعد انقطاع المضيف.");
          return;
        }
        const [{ data: playerData, error: playerError }, { data: roomData, error: roomError }] =
          await Promise.all([
            supabase.rpc("resume_party_player", {
              p_room_code: stored.roomCode,
              p_player_id: stored.playerId,
              p_player_token: stored.token,
            }),
            supabase.from("party_rooms")
              .select(PARTY_ROOM_COLUMNS)
              .eq("code", stored.roomCode)
              .single(),
          ]);
        const resumedPlayer = Array.isArray(playerData) ? playerData[0] : playerData;
        if (!cancelled && (playerError || roomError)) {
          setErrorMsg(`تعذر استعادة الجلسة: ${playerError?.message ?? roomError?.message}`);
          return;
        }
        if (!cancelled && !playerError && !roomError && resumedPlayer && roomData) {
          const player = resumedPlayer as PlayerRow;
          const restoredRoom = roomData as RoomData;
          const validStatuses = ["lobby", "question", "reveal", "leaderboard", "finished"];
          if (validStatuses.includes(restoredRoom.status)) {
            myIdRef.current = stored.playerId;
            playerTokenRef.current = stored.token;
            currentQIdxRef.current = restoredRoom.current_question;
            questionStartRef.current = Number(restoredRoom.question_start_time) || 0;
            lastSeenRef.current = {
              status: restoredRoom.status,
              qIdx: restoredRoom.current_question,
            };
            setMyId(stored.playerId);
            setNickname(player.nickname);
            setMyScore(player.score);
            setRoom(restoredRoom);
            setCurrentQIdx(restoredRoom.current_question);
            const qs = (await getPartyQuestions(
              restoredRoom.code,
              restoredRoom.category || "mix",
              restoredRoom.total_questions || 10,
            )).map(q => shuffleQuestion(q, q.id));
            if (cancelled) return;
            setPartyQs(qs);
            const restoredPhase = guestResumePhase(
              restoredRoom.status as ResumablePartyStatus,
              player.answered_current,
            );
            if (player.answered_current) setSelected(player.last_answer);
            if (restoredPhase === "answered") {
              answeringRef.current = true;
              deadlineLockedRef.current = true;
            } else if (restoredPhase === "question") {
              answeringRef.current = false;
              deadlineLockedRef.current = false;
              setSelected(null);
              startTimer(questionStartRef.current, restoredRoom.answer_time);
            }
            phaseRef.current = restoredPhase;
            setPhase(restoredPhase);
            subscribeToRoom(restoredRoom.code);
            startRoomPolling(restoredRoom.code);
            void fetchPlayers(restoredRoom.code);
            return;
          }
        }
        sessionStorage.removeItem(PARTY_GUEST_SESSION_KEY);
      } else if (sessionStorage.getItem(PARTY_GUEST_SESSION_KEY) && !stored) {
        sessionStorage.removeItem(PARTY_GUEST_SESSION_KEY);
      }
      if (!cancelled && urlCode && urlCode.length === 4) {
        await lookupRoomByCode(urlCode);
      }
    };
    void restore()
      .catch(() => setErrorMsg("تعذر استعادة الجلسة. تحقق من الاتصال ثم أعد تحميل الصفحة."))
      .finally(() => { if (!cancelled) setRestoringSession(false); });
    return () => { cancelled = true; };
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

  async function maintainRoom(code: string, force = false): Promise<string | null> {
    const now = Date.now();
    if (!force && now - lastMaintenanceAtRef.current < 5000) return null;
    lastMaintenanceAtRef.current = now;
    const { data, error } = await supabase.rpc("maintain_party_room", {
      p_room_code: code,
    });
    if (error) throw new Error(error.message);
    const result = Array.isArray(data) ? data[0] : data;
    return typeof result === "string" ? result : null;
  }

  function handleDeletedRoom() {
    sessionStorage.removeItem(PARTY_GUEST_SESSION_KEY);
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    myIdRef.current = "";
    playerTokenRef.current = "";
    setRoom(null);
    setMyId("");
    setAllPlayers([]);
    setSelected(null);
    setErrorMsg("انتهت الغرفة وتم تنظيفها بعد انقطاع المضيف.");
    phaseRef.current = "enter_code";
    setPhase("enter_code");
  }

  // ── PRIMARY: poll party_rooms every 1.5s for all game state ─────────────
  // Realtime is unreliable; polling is the authoritative sync mechanism.
  function startRoomPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const maintenance = await maintainRoom(code);
        if (maintenance === "deleted" || maintenance === "missing") {
          handleDeletedRoom();
          return;
        }
        const { data: roomData } = await supabase
          .from("party_rooms").select(PARTY_ROOM_COLUMNS).eq("code", code).single();
        if (!roomData) return;
        // Connection healthy — clear any stale "lost" indicator
        setConnectionLost(false);
        consecutiveFailsRef.current = 0;

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
      } catch {
        // Track consecutive failures so we can surface a "reconnecting" banner
        consecutiveFailsRef.current += 1;
        if (consecutiveFailsRef.current >= 3) setConnectionLost(true);
      }
    }, PARTY_POLL_MS);
  }

  // ── Step 1: look up room by code ─────────────────────────────────────────
  async function lookupRoomByCode(code: string) {
    setErrorMsg("");
    if (code.length !== 4) { setErrorMsg("أدخل رمزاً مكوناً من 4 أرقام."); return; }
    try {
      const maintenance = await maintainRoom(code, true);
      if (maintenance === "deleted" || maintenance === "missing") {
        setErrorMsg("الغرفة غير موجودة أو تم تنظيفها بعد انقطاع المضيف.");
        return;
      }
    } catch (maintenanceError) {
      setErrorMsg(`تعذر التحقق من الغرفة: ${maintenanceError instanceof Error ? maintenanceError.message : "خطأ اتصال"}`);
      return;
    }
    const { data, error } = await supabase
      .from("party_rooms").select(PARTY_ROOM_COLUMNS).eq("code", code).single();
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

    playerTokenRef.current = crypto.randomUUID();
    const { data, error } = await supabase.rpc("join_party_room", {
      p_room_code: room.code,
      p_nickname: nickname.trim(),
      p_player_token: playerTokenRef.current,
    });
    const rawPlayerId = Array.isArray(data)
      ? (data[0] as { join_party_room?: unknown } | string | undefined)
      : data;
    const playerIdValue = typeof rawPlayerId === "object" && rawPlayerId !== null
      ? rawPlayerId.join_party_room
      : rawPlayerId;
    const playerId = typeof playerIdValue === "string" ? playerIdValue : "";
    if (error || !playerId) {
      playerTokenRef.current = "";
      setErrorMsg(`خطأ في الانضمام: ${error?.message ?? "استجابة غير صالحة من الخادم"}`);
      return;
    }

    myIdRef.current = playerId;
    setMyId(playerId);
    sessionStorage.setItem(PARTY_GUEST_SESSION_KEY, serializePartyGuestSession({
      role: "guest",
      roomCode: room.code,
      playerId,
      token: playerTokenRef.current,
      nickname: nickname.trim(),
    }));

    const qs = await getPartyQuestions(room.code, room.category || "mix", room.total_questions || 10);
    // Deterministic shuffle by q.id so host + all guests see identical option order
    setPartyQs(qs.map((q) => shuffleQuestion(q, q.id)));

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
      const sharedStart = Number(updatedRoom.question_start_time);
      const now = Number.isFinite(sharedStart) && sharedStart > 0 ? sharedStart : Date.now();
      answeringRef.current = false;
      deadlineLockedRef.current = false;
      questionStartRef.current = now;
      currentQIdxRef.current = qIdx;
      setCurrentQIdx(qIdx);
      setSelected(null);
      setRoundPoints(null);
      setAnswerRejected(false);
      setErrorMsg("");
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
          flashScreen("correct");
          const newStreak = consecutiveRef.current + 1;
          consecutiveRef.current = newStreak;
          setConsecutiveCorrect(newStreak);
          if (newStreak >= 2) {
            setShowStreakBanner(true);
            setTimeout(() => setShowStreakBanner(false), 3000);
          }
        } else {
          playSound("wrong");
          flashScreen("wrong");
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
      // Victory fanfare for top-3 finishers (deferred slightly to layer over gameover)
      setTimeout(() => {
        const me = allPlayers.find(p => p.id === myIdRef.current);
        const myFinalRank =
          [...allPlayers].sort((a, b) => b.score - a.score).findIndex(p => p.id === myIdRef.current) + 1;
        if (me && myFinalRank >= 1 && myFinalRank <= 3) {
          playSound("levelup");
          setTimeout(() => playSound("achievement"), 500);
        }
      }, 400);
    }
    // "lobby" status → stay on waiting screen, nothing to do
  }

  // ── Local countdown timer (uses room's answer_time setting) ─────────────
  function startTimer(startMs: number, answerTimeOverride?: number) {
    // Read room data at call time (polling has updated it by now)
    const totalSec = answerTimeOverride || room?.answer_time || DEFAULT_QUESTION_TIME;
    if (timerRef.current) clearInterval(timerRef.current);
    const initialElapsed = (Date.now() - startMs) / 1000;
    const initialRemaining = Math.max(0, totalSec - Math.floor(initialElapsed));
    setTimeLeft(initialRemaining);
    if (initialRemaining <= 0) {
      deadlineLockedRef.current = true;
      return;
    }
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const remaining = Math.max(0, totalSec - Math.floor(elapsed));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0) playSound("tick");
      if (remaining <= 0) {
        deadlineLockedRef.current = true;
        clearInterval(timerRef.current!);
      }
    }, 500);
  }

  // ── Answer a question ────────────────────────────────────────────────────
  async function handleAnswer(idx: number) {
    const elapsedMs = Math.max(0, Date.now() - questionStartRef.current);
    const roomAnswerTime = room?.answer_time || DEFAULT_QUESTION_TIME;
    if (
      deadlineLockedRef.current ||
      timeLeft <= 0 ||
      elapsedMs > roomAnswerTime * 1000 ||
      answeringRef.current ||
      selected !== null ||
      phaseRef.current !== "question"
    ) {
      if (elapsedMs > roomAnswerTime * 1000) {
        deadlineLockedRef.current = true;
        setTimeLeft(0);
      }
      return;
    }
    answeringRef.current = true;
    const questionIdx = currentQIdxRef.current;
    if (timerRef.current) clearInterval(timerRef.current);

    const q = partyQs[currentQIdx];
    const isCorrect = q && idx === q.correct;
    const roomScoring = room?.scoring_type || "speed";

    setSelected(idx);
    setRoundPoints(null);
    phaseRef.current = "answered";
    setPhase("answered");

    // sounds deferred to reveal phase so correct answer isn't leaked

    // The server validates phase/deadline and stamps the answer with DB time.
    const { data: rpcData, error } = await supabase.rpc("submit_party_answer", {
      p_player_id: myIdRef.current,
      p_room_code: room?.code ?? "",
      p_question_index: questionIdx,
      p_answer: idx,
      p_player_token: playerTokenRef.current,
    });
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const accepted = !!(result && typeof result === "object" && "accepted" in result && result.accepted);
    const answeredAt = result && typeof result === "object" && "answered_at" in result
      ? Number(result.answered_at)
      : null;
    if (!isCurrentPartyAnswerResponse(questionIdx, currentQIdxRef.current)) {
      return;
    }
    if (
      error &&
      phaseRef.current === "answered" &&
      currentQIdxRef.current === questionIdx
    ) {
      answeringRef.current = false;
      setSelected(null);
      setRoundPoints(null);
      setErrorMsg(`تعذر إرسال الإجابة: ${error.message}`);
      phaseRef.current = "question";
      setPhase("question");
      startTimer(questionStartRef.current);
    } else if (!error && !accepted) {
      deadlineLockedRef.current = true;
      setAnswerRejected(true);
      setSelected(null);
      setRoundPoints(null);
      setTimeLeft(0);
    } else if (accepted) {
      const authoritativePoints = partyRoundPointsFromAcceptedResponse(
        questionIdx,
        currentQIdxRef.current,
        !!isCorrect,
        answeredAt,
        questionStartRef.current,
        roomAnswerTime,
        roomScoring,
      );
      if (authoritativePoints === null) {
        setErrorMsg("تعذر تأكيد توقيت الإجابة من الخادم.");
        setRoundPoints(null);
      } else {
        setRoundPoints(authoritativePoints);
      }
    }
  }

  async function leaveParty(destination: "/" | "/party/guest") {
    const { error } = await supabase.rpc("leave_party_room", {
      p_room_code: room?.code ?? "",
      p_player_id: myIdRef.current,
      p_player_token: playerTokenRef.current,
    });
    if (error) {
      alert(`تعذر مغادرة الغرفة: ${error.message}`);
      return;
    }
    sessionStorage.removeItem(PARTY_GUEST_SESSION_KEY);
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    myIdRef.current = "";
    playerTokenRef.current = "";
    if (destination === "/party/guest") {
      setRoom(null);
      setMyId("");
      setNickname("");
      setCodeInput("");
      setAllPlayers([]);
      setSelected(null);
      setRoundPoints(null);
      phaseRef.current = "enter_code";
      setPhase("enter_code");
    } else {
      navigate(destination);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const currentQ = partyQs[currentQIdx] ?? null;
  const roomAnswerTime = room?.answer_time || DEFAULT_QUESTION_TIME;
  const timerPct = (timeLeft / roomAnswerTime) * 100;
  const isDanger = timeLeft <= 5;
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const myRank = sorted.findIndex(p => p.id === myId) + 1;
  const isCorrectAnswer = selected !== null && currentQ ? selected === currentQ.correct : false;

  // ── Connection lost banner (shown across all phases) ─────────────────────
  const ConnectionBanner = () => connectionLost ? (
    <div className="fixed inset-x-0 top-2 z-[60] flex justify-center px-3 pointer-events-none">
      <div className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600/95 border border-red-400 shadow-2xl flex items-center gap-2 animate-pulse motion-reduce:animate-none" data-testid="status-party-reconnecting" role="status">
        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
        انقطع الاتصال — جاري إعادة الاتصال...
      </div>
    </div>
  ) : null;

  // ── ENTER CODE ───────────────────────────────────────────────────────────
  if (restoringSession) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center" aria-live="polite">
        <p className="font-bold text-muted-foreground animate-pulse motion-reduce:animate-none">جارٍ استعادة الجلسة...</p>
      </div>
    );
  }

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
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-6 gap-6 text-center overflow-y-auto">
        <ConnectionBanner />
        {/* Big room code chip */}
        <div className="text-center">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest">رمز الغرفة</p>
          <p
            className="text-6xl font-black tracking-[0.25em] tabular-nums gradient-text leading-none"
            data-testid="text-guest-room-code"
            dir="ltr"
            style={{ filter: "drop-shadow(0 0 18px rgba(245,158,11,0.55))" }}
          >
            {room?.code}
          </p>
        </div>
        <div className="fade-in-up">
          <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center mx-auto mb-4 animate-pulse motion-reduce:animate-none">
            <span className="text-4xl">⌛</span>
          </div>
          <h1 className="text-2xl font-black text-primary animate-pulse motion-reduce:animate-none" data-testid="status-guest-waiting" aria-live="polite">في انتظار بدء اللعبة...</h1>
          <p className="text-muted-foreground text-sm mt-1">
            مرحباً <span className="text-foreground font-bold">{nickname}</span>!
          </p>
        </div>
        <div className="w-full max-w-sm">
          <p className="text-xs text-muted-foreground font-bold mb-3">اللاعبون ({allPlayers.length})</p>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
            {allPlayers.map(p => (
              <div key={p.id}
                className={`flex items-center gap-2 bg-card border rounded-xl px-3 py-2 ${p.id === myId ? "border-primary" : "border-border"}`}>
                <span className="text-green-400 text-xs">✓</span>
                <span className="text-sm font-bold min-w-0 break-words [overflow-wrap:anywhere]">{p.nickname}</span>
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
            <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center mx-auto mb-4 ${
              answerRejected ? "bg-red-500/20 border-red-500" : "bg-green-500/20 border-green-500"
            }`}>
              <span className="text-5xl">{answerRejected ? "⏱️" : "✓"}</span>
            </div>
            <h2 className={`text-2xl font-black ${answerRejected ? "text-red-500" : "text-green-500"}`}>
              {answerRejected ? "انتهى وقت الإجابة" : "تم إرسال الإجابة!"}
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              {answerRejected ? "لم تُحتسب الإجابة لهذه الجولة" : "في انتظار بقية اللاعبين..."}
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-xs" data-testid="status-guest-answer-locked" aria-live="polite">
            {!answerRejected && (
              <>
                <p className="text-xs text-muted-foreground mb-1">اخترت</p>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <span className="text-3xl">{ANSWER_COLORS[selected!]?.emoji}</span>
                  <span className="font-black text-lg">{ANSWER_COLORS[selected!]?.label}</span>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">نقاطك الحالية</p>
            <p className="text-3xl font-black text-primary mt-1" data-testid="text-guest-live-score">{myScore}</p>
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
          <div className="flex justify-between items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">سؤال {currentQIdx + 1}/{partyQs.length}</p>
              <p className="text-sm font-black text-primary">{myScore} نقطة</p>
            </div>
            <CircularTimer
              timeLeft={timeLeft}
              totalTime={roomAnswerTime}
              size={72}
              strokeWidth={6}
            />
          </div>
        </header>

        {/* Question image (always shown if present) + text (optional) */}
        <div className="px-4 py-3 text-center">
          {errorMsg && (
            <p className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-500" role="alert">
              {errorMsg}
            </p>
          )}
          {currentQ?.image_url && (
            <QuestionImage url={currentQ.image_url} maxHeight={150} className="mb-2" />
          )}
          {room?.show_question_on_phone && currentQ ? (
            <div className="bg-card border border-border rounded-xl p-3 mb-2">
              <p className="text-sm font-bold leading-relaxed break-words [overflow-wrap:anywhere]">{currentQ.question}</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm font-bold">انظر إلى الشاشة الكبيرة واختر إجابتك 👇</p>
          )}
        </div>

        {/* 4 HUGE colored answer buttons — fill screen, look at TV */}
        <div className="flex-1 p-3 grid grid-cols-2 grid-rows-2 gap-3">
          {ANSWER_COLORS.map((color, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={selected !== null || timeLeft <= 0}
              data-testid={`button-party-answer-${idx}`}
              aria-label={`الإجابة ${color.label}`}
              className="rounded-3xl flex items-center justify-center text-white font-black transition-all active:scale-[0.94] disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg,${color.bg},${color.dark})`,
                boxShadow: `0 10px 30px ${color.bg}55, inset 0 0 24px rgba(255,255,255,0.08)`,
                border: "2px solid rgba(255,255,255,0.18)",
                minHeight: "38vh",
              }}>
              <span style={{ fontSize: "clamp(56px, 18vw, 120px)" }}>{color.emoji}</span>
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
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-6 gap-6 text-center overflow-y-auto">
        {showStreakBanner && streakMsg && (
          <div className="fixed inset-x-0 top-6 z-50 flex justify-center px-4 pointer-events-none">
            <div className="px-6 py-3 rounded-2xl font-black text-xl text-white shadow-2xl animate-bounce motion-reduce:animate-none"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
              {streakMsg} {consecutiveCorrect} صح متتالية!
            </div>
          </div>
        )}
        <div className="fade-in-up w-full max-w-sm space-y-4">
          {/* Result indicator */}
          <div data-testid="status-guest-reveal-result" aria-live="assertive" className={`rounded-3xl p-6 border-2 ${
            !didAnswer ? "bg-card border-border" :
            wasCorrect ? "bg-green-500/15 border-green-500/50" : "bg-red-500/15 border-red-500/50"
          }`}>
            <p className="text-5xl mb-2">{!didAnswer ? "⏰" : wasCorrect ? "🎉" : "❌"}</p>
            <h2 className={`text-2xl font-black ${wasCorrect ? "text-green-400" : !didAnswer ? "text-muted-foreground" : "text-red-400"}`}>
              {!didAnswer ? "انتهى الوقت!" : wasCorrect ? "إجابة صحيحة!" : "إجابة خاطئة"}
            </h2>
            {roundPoints !== null && roundPoints > 0 && (
              <p className="text-yellow-500 font-black text-xl mt-2" data-testid="text-guest-round-points">+{roundPoints} نقطة</p>
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
              <p className="text-3xl font-black text-primary" data-testid="text-guest-reveal-score">{myScore}</p>
              <p className="text-xs text-muted-foreground">نقاطك</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-3xl font-black text-foreground" data-testid="text-guest-reveal-rank">#{myRank || "-"}</p>
              <p className="text-xs text-muted-foreground">مركزك</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground animate-pulse motion-reduce:animate-none">جاري عرض الترتيب...</p>
      </div>
    );
  }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-6 gap-5 text-center overflow-y-auto">
        <div className="fade-in-up" data-testid="status-guest-leaderboard" aria-live="polite">
          <p className="text-4xl mb-2">🏆</p>
          <h2 className="text-xl font-black text-primary">الترتيب الحالي</h2>
          <p className="text-muted-foreground text-sm mt-1">
            أنت في المركز <span className="font-black text-foreground">#{myRank || "-"}</span>
          </p>
        </div>
        <div className="w-full max-w-sm md:max-w-md space-y-2">
          {sorted.slice(0, 5).map((p, i) => (
            <div key={p.id} data-testid={`row-guest-leaderboard-${i + 1}`}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                p.id === myId ? "border-primary bg-primary/10" :
                i === 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                "bg-card border-border"
              }`}>
              <span>{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className={`flex-1 min-w-0 font-bold text-sm text-right break-words [overflow-wrap:anywhere] ${p.id === myId ? "text-primary" : ""}`}>
                {p.nickname}{p.id === myId && " (أنت)"}
              </span>
              <span className="font-black text-primary">{p.score}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground animate-pulse motion-reduce:animate-none">في انتظار السؤال التالي...</p>
      </div>
    );
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (phase === "finished") {
    const isTop3 = myRank >= 1 && myRank <= 3;
    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-4 sm:p-6 gap-5 text-center overflow-y-auto">
        <div className="fade-in-up" data-testid="status-guest-party-finished" aria-live="assertive">
          <p className="text-6xl mb-2">
            {myRank === 1 ? "🏆" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🎮"}
          </p>
          <h1 className="text-2xl font-black text-primary">انتهت اللعبة!</h1>
          <p className="text-muted-foreground text-sm mt-1">
            مركزك النهائي: <span className="font-black text-foreground text-lg">#{myRank || "-"}</span>
          </p>
          <p className="text-primary font-black text-3xl mt-2">{myScore} نقطة</p>
          {isTop3 && (
            <p className="text-yellow-500 font-bold text-sm mt-2 animate-pulse motion-reduce:animate-none">
              🎉 مبروك! أنت في المنصة!
            </p>
          )}
        </div>

        {sorted.length > 0 && (
          <div className="grid grid-cols-3 items-end gap-2 w-full max-w-md" data-testid="podium-guest-final">
            <div className="min-w-0">
              {sorted[1] && (
                <div className="bg-slate-400/15 border border-slate-400/30 rounded-t-2xl min-h-24 px-2 py-3 flex flex-col justify-end">
                  <span className="text-2xl">🥈</span>
                  <p className="text-xs font-black break-words [overflow-wrap:anywhere]">{sorted[1].nickname}</p>
                  <p className="text-xs text-primary font-bold">{sorted[1].score}</p>
                </div>
              )}
            </div>
            <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-t-2xl min-h-32 px-2 py-3 flex flex-col justify-end shadow-lg shadow-yellow-500/10 min-w-0">
              <span className="text-3xl">🥇</span>
              <p className="text-sm font-black break-words [overflow-wrap:anywhere]">{sorted[0].nickname}</p>
              <p className="text-sm text-primary font-bold">{sorted[0].score}</p>
            </div>
            <div className="min-w-0">
              {sorted[2] && (
                <div className="bg-orange-700/15 border border-orange-700/30 rounded-t-2xl min-h-20 px-2 py-3 flex flex-col justify-end">
                  <span className="text-2xl">🥉</span>
                  <p className="text-xs font-black break-words [overflow-wrap:anywhere]">{sorted[2].nickname}</p>
                  <p className="text-xs text-primary font-bold">{sorted[2].score}</p>
                </div>
              )}
            </div>
          </div>
        )}

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
              <span className={`flex-1 min-w-0 font-bold text-right text-sm break-words [overflow-wrap:anywhere] ${p.id === myId ? "text-primary" : ""}`}>
                {p.nickname}{p.id === myId && " (أنت)"}
              </span>
              <span className="font-black text-primary">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => void leaveParty("/party/guest")}
            data-testid="button-guest-join-again"
            className="min-h-12 px-6 py-3 rounded-xl font-bold text-white text-sm"
            style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}>
            انضم مجدداً
          </button>
          <button onClick={() => void leaveParty("/")}
            className="px-6 py-3 rounded-xl font-bold bg-card border border-border text-foreground text-sm">
            الرئيسية
          </button>
        </div>
      </div>
    );
  }

  return null;
}
