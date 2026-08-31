import { supabase } from "./supabase";
import type { DbUser } from "./AuthContext";

// ──────────────────────────── SCORES / LEADERBOARD ────────────────────────────

const CACHE_TTL_MS = 30_000;
const GAME_REQUEST_TIMEOUT_MS = 12_000;
const SCORE_COLUMNS = "id, user_id, username, category, score, game_mode, created_at";
const USER_COLUMNS = "id, auth_id, username, avatar_url, total_wins, total_losses, streak_count, longest_streak, last_played, is_premium, total_points, created_at, xp, level, coins, rank_title, achievements, season_points, display_name, country, bio, gender, onboarding_completed, favorite_categories";
const CHALLENGE_COLUMNS = "id, creator_id, creator_name, opponent_id, opponent_name, status, creator_score, opponent_score, category, question_ids, creator_answers, opponent_answers, question_count, created_at, winner";
const FRIEND_COLUMNS = "id, user_id, friend_id, friend_name, friend_avatar, friend_country, status, created_at";
const RANKED_USER_COLUMNS = "id, username, display_name, country, total_points, season_points, total_wins, avatar_url, achievements";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const leaderboardCache = new Map<string, CacheEntry<unknown>>();
const leaderboardInflight = new Map<string, Promise<unknown>>();
let leaderboardGeneration = 0;

function cached<T>(key: string): T | undefined {
  const entry = leaderboardCache.get(key);
  return entry && entry.expiresAt > Date.now() ? entry.value as T : undefined;
}

async function cachedLeaderboard<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
  if (force) {
    invalidateLeaderboardCache();
  } else {
    const value = cached<T>(key);
    if (value !== undefined) return value;
    const pending = leaderboardInflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const generation = leaderboardGeneration;
  const request = load();
  leaderboardInflight.set(key, request);
  try {
    const value = await request;
    if (generation === leaderboardGeneration) {
      leaderboardCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return value;
  } finally {
    if (leaderboardInflight.get(key) === request) leaderboardInflight.delete(key);
  }
}

export function invalidateLeaderboardCache(): void {
  leaderboardGeneration++;
  leaderboardCache.clear();
  leaderboardInflight.clear();
}

export interface ScoreEntry {
  id: string;
  user_id: string | null;
  username: string;
  category: string;
  score: number;
  total?: number;       // optional — column may not exist in older DB schemas
  game_mode: string;
  created_at: string;
}

export async function insertScore(entry: {
  user_id?: string | null;
  username: string;
  category: string;
  score: number;
  game_mode: string;
}): Promise<boolean> {
  // NOTE: 'total' column excluded — the table was created without it.
  // If you want to add it, run in Supabase SQL Editor:
  //   ALTER TABLE scores ADD COLUMN IF NOT EXISTS total INT DEFAULT 0;
  const payload: Record<string, unknown> = {
    user_id: entry.user_id ?? null,
    username: entry.username,
    category: entry.category,
    score: entry.score,
    game_mode: entry.game_mode,
  };
  const { data, error } = await supabase.from("scores").insert(payload).select("id");
  if (error) {
    console.error("[ميدان] insertScore FAILED ✗", error.code, error.message, error.details);
    return false;
  }
  invalidateLeaderboardCache();
  return true;
}

export async function getWeeklyLeaderboard(category?: string): Promise<ScoreEntry[]> {
  const key = `scores:weekly:${category ?? "all"}`;
  return cachedLeaderboard(key, async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    let q = supabase
      .from("scores")
      .select(SCORE_COLUMNS)
      .gte("created_at", weekAgo)
      .order("score", { ascending: false })
      .limit(50);
    if (category && category !== "all") q = q.eq("category", category);
    const { data, error } = await q;
    if (error) console.error("[ميدان] getWeeklyLeaderboard error", error.message);
    return dedupeByUsername((data ?? []) as ScoreEntry[]);
  });
}

export async function getAllTimeLeaderboard(category?: string): Promise<ScoreEntry[]> {
  const key = `scores:alltime:${category ?? "all"}`;
  return cachedLeaderboard(key, async () => {
    let q = supabase
      .from("scores")
      .select(SCORE_COLUMNS)
      .order("score", { ascending: false })
      .limit(200);
    if (category && category !== "all") q = q.eq("category", category);
    const { data, error } = await q;
    if (error) console.error("[ميدان] getAllTimeLeaderboard error", error.message);
    return dedupeByUsername((data ?? []) as ScoreEntry[]);
  });
}

export interface RankedLeaderboardEntry {
  id: string;
  username: string;
  display_name: string | null;
  country: string | null;
  total_points: number;
  season_points: number | null;
  total_wins: number | null;
  avatar_url: string | null;
  achievements: unknown;
}

export type LeaderboardPeriod = "weekly" | "alltime";

export async function getUserLeaderboard(
  period: LeaderboardPeriod,
  forceRefresh = false,
): Promise<RankedLeaderboardEntry[]> {
  const sortField = period === "weekly" ? "season_points" : "total_points";
  return cachedLeaderboard(`users:${period}`, async () => {
    const { data, error } = await supabase
      .from("users")
      .select(RANKED_USER_COLUMNS)
      .gt(sortField, 0)
      .order(sortField, { ascending: false })
      .order("total_wins", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as RankedLeaderboardEntry[];
  }, forceRefresh);
}

export async function getUserLeaderboardRank(params: {
  userId: string;
  period: LeaderboardPeriod;
  score: number;
  wins: number;
  forceRefresh?: boolean;
}): Promise<number | null> {
  if (params.score <= 0) return null;
  const sortField = params.period === "weekly" ? "season_points" : "total_points";
  const key = `users:rank:${params.period}:${params.userId}:${params.score}:${params.wins}`;
  return cachedLeaderboard(key, async () => {
    const [above, tied] = await Promise.all([
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gt(sortField, params.score),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq(sortField, params.score)
        .gt("total_wins", params.wins),
    ]);
    if (above.error) throw above.error;
    if (tied.error) throw tied.error;
    return (above.count ?? 0) + (tied.count ?? 0) + 1;
  }, params.forceRefresh);
}

// Keep best score per username
function dedupeByUsername(entries: ScoreEntry[]): ScoreEntry[] {
  const seen = new Map<string, ScoreEntry>();
  for (const e of entries) {
    const existing = seen.get(e.username);
    if (!existing || e.score > existing.score) seen.set(e.username, e);
  }
  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// ──────────────────────────── STREAK SYNC ────────────────────────────

export async function syncStreak(userId: string): Promise<{
  streak_count: number;
  longest_streak: number;
} | null> {
  const { data: user } = await supabase
    .from("users")
    .select("streak_count, longest_streak, last_played")
    .eq("id", userId)
    .single();

  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (user.last_played === today) {
    // Already updated today
    return { streak_count: user.streak_count, longest_streak: user.longest_streak };
  }

  let newStreak = user.last_played === yesterday ? user.streak_count + 1 : 1;
  const newLongest = Math.max(newStreak, user.longest_streak);

  const { data: updated } = await supabase
    .from("users")
    .update({ streak_count: newStreak, longest_streak: newLongest, last_played: today })
    .eq("id", userId)
    .select("streak_count, longest_streak")
    .single();

  return updated ?? null;
}

// ──────────────────────────── USER PROFILE ────────────────────────────

export async function updateUserStats(userId: string, delta: {
  total_wins?: number;
  total_losses?: number;
  total_points?: number;
}): Promise<boolean> {
  // Fetch current values then increment
  const { data: current, error: readError } = await supabase
    .from("users")
    .select("total_wins, total_losses, total_points")
    .eq("id", userId)
    .single();
  if (readError || !current) {
    if (readError) console.error("updateUserStats read error", readError);
    return false;
  }

  const { data: updated, error } = await supabase
    .from("users")
    .update({
      total_wins: current.total_wins + (delta.total_wins ?? 0),
      total_losses: current.total_losses + (delta.total_losses ?? 0),
      total_points: current.total_points + (delta.total_points ?? 0),
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("updateUserStats error", error);
    return false;
  }
  return true;
}

export async function setPremiumStatus(userId: string, isPremium: boolean): Promise<DbUser | null> {
  const { data } = await supabase
    .from("users")
    .update({ is_premium: isPremium })
    .eq("id", userId)
    .select(USER_COLUMNS)
    .single();
  return data ?? null;
}

// ──────────────────────────── CHALLENGES (cross-device) ────────────────────────────

export interface DbChallenge {
  id: string;
  creator_id: string | null;
  creator_name: string;
  opponent_id: string | null;
  opponent_name: string | null;
  status: string;
  creator_score: number | null;
  opponent_score: number | null;
  category: string;
  question_ids: string;        // JSON array of question IDs
  creator_answers: string | null;  // JSON array
  opponent_answers: string | null; // JSON array
  question_count: number;
  created_at: string;
  winner?: "creator" | "opponent" | "draw" | null;
}

export async function createDbChallenge(params: {
  id?: string;
  creator_id: string | null;
  creator_name: string;
  category: string;
  question_ids: number[];
  creator_answers: (number | null)[];
  creator_score: number;
  question_count: number;
}): Promise<string | null> {
  const payload: Record<string, unknown> = {
    creator_id: params.creator_id,
    creator_name: params.creator_name,
    category: params.category,
    question_ids: JSON.stringify(params.question_ids),
    creator_answers: JSON.stringify(params.creator_answers),
    creator_score: params.creator_score,
    question_count: params.question_count,
    status: "pending",
  };
  if (params.id) payload.id = params.id;

  const { data, error } = await supabase
    .from("challenges")
    .insert(payload)
    .select("id")
    .single();

  if (error) { console.error("createDbChallenge error", error); return null; }
  return data?.id ?? null;
}

export async function getMyChallenges(userId: string, limit = 20): Promise<DbChallenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select(CHALLENGE_COLUMNS)
    .eq("creator_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) { console.error("getMyChallenges error", error); return []; }
  return (data as DbChallenge[]) ?? [];
}

export async function getDbChallenge(id: string): Promise<DbChallenge | null> {
  const { data } = await supabase
    .from("challenges")
    .select(CHALLENGE_COLUMNS)
    .eq("id", id)
    .single();
  return data ?? null;
}

export async function completeDbChallenge(id: string, params: {
  opponent_id?: string | null;
  opponent_name: string;
  opponent_answers: (number | null)[];
  opponent_score: number;
}): Promise<void> {
  // Read creator_score so we can persist a deterministic "winner" field.
  const existing = await getDbChallenge(id);
  const creatorScore = existing?.creator_score ?? 0;
  const winner: "creator" | "opponent" | "draw" =
    params.opponent_score > creatorScore ? "opponent" :
    params.opponent_score < creatorScore ? "creator" : "draw";

  // Guard against race: only the FIRST opponent to finish writes their result.
  // Any subsequent attempts will match zero rows because status is no longer "pending".
  const { error } = await supabase
    .from("challenges")
    .update({
      opponent_id: params.opponent_id ?? null,
      opponent_name: params.opponent_name,
      opponent_answers: JSON.stringify(params.opponent_answers),
      opponent_score: params.opponent_score,
      winner,
      status: "completed",
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) console.error("completeDbChallenge error", error);
}

// ──────────────────────────── FRIENDS ────────────────────────────
export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  friend_name: string | null;
  friend_avatar: string | null;
  friend_country: string | null;
  status: string;
  created_at: string;
}

export async function addFriend(params: {
  user_id: string;
  friend_id: string;
  friend_name?: string | null;
  friend_avatar?: string | null;
  friend_country?: string | null;
}): Promise<boolean> {
  if (params.user_id === params.friend_id) return false;
  const { error } = await supabase.from("friends").upsert(
    {
      user_id: params.user_id,
      friend_id: params.friend_id,
      friend_name: params.friend_name ?? null,
      friend_avatar: params.friend_avatar ?? null,
      friend_country: params.friend_country ?? null,
      status: "accepted",
    },
    { onConflict: "user_id,friend_id" }
  );
  if (error) { console.error("addFriend error", error); return false; }
  return true;
}

export async function getFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from("friends")
    .select(FRIEND_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) { console.error("getFriends error", error); return []; }
  return (data as Friend[]) ?? [];
}

export async function isFriend(userId: string, friendId: string): Promise<boolean> {
  const { data } = await supabase
    .from("friends")
    .select("id")
    .eq("user_id", userId)
    .eq("friend_id", friendId)
    .eq("status", "accepted")
    .maybeSingle();
  return !!data;
}

export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
  const { error } = await supabase
    .from("friends")
    .delete()
    .eq("user_id", userId)
    .eq("friend_id", friendId);
  if (error) { console.error("removeFriend error", error); return false; }
  return true;
}

// ──────────────────────────── PUBLIC PROFILE ────────────────────────────
export async function getPublicProfile(userId: string): Promise<DbUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select(USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) { console.error("getPublicProfile error", error); return null; }
  return (data as DbUser) ?? null;
}

// ──────────────────────────── DAILY RANK / PERCENTILE ────────────────────────────
export async function getDailyPercentile(date: string, myScore: number): Promise<number | null> {
  const { count: total, error: e1 } = await supabase
    .from("daily_scores")
    .select("user_id", { count: "exact", head: true })
    .eq("date", date);
  if (e1 || !total) return null;
  const { count: below, error: e2 } = await supabase
    .from("daily_scores")
    .select("user_id", { count: "exact", head: true })
    .eq("date", date)
    .lt("score", myScore);
  if (e2 || below == null) return null;
  return Math.round((below / total) * 100);
}

// ──────────────────────────── SERVER-AUTHORITATIVE GAMES ─────────────────────

export interface DailyAttempt {
  id: string;
  user_id: string;
  challenge_date: string;
  status: "active" | "completed";
  current_question_index: number;
  question_started_at: number;
  score: number;
  correct_count: number;
  completed_at: string | null;
  question_ids: number[];
}

function rpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function withGameTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out`)),
      GAME_REQUEST_TIMEOUT_MS,
    );
    Promise.resolve(request).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function gameGuestToken(userId: string): string | null {
  if (!userId.startsWith("guest_")) return null;
  const key = "maydan_game_guest_capability";
  let token = localStorage.getItem(key);
  if (!token) {
    token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    localStorage.setItem(key, token);
  }
  return token;
}

export async function enterRankedQueue(params: {
  userId: string;
  username: string;
  preferredCategories: string[];
}): Promise<Record<string, unknown> | null> {
  const { data, error } = await withGameTimeout(
    supabase.rpc("enter_ranked_queue", {
      p_user_id: params.userId,
      p_username: params.username,
      p_preferred_categories: params.preferredCategories,
      p_guest_token: gameGuestToken(params.userId),
    }),
    "enter ranked queue",
  );
  if (error) throw error;
  return rpcRow(data) as Record<string, unknown> | null;
}

export async function cancelRankedQueue(userId: string): Promise<void> {
  const { error } = await withGameTimeout(
    supabase.rpc("cancel_ranked_queue", {
      p_user_id: userId,
      p_guest_token: gameGuestToken(userId),
    }),
    "cancel ranked queue",
  );
  if (error) throw error;
}

export async function submitRankedAnswer(params: {
  matchId: string;
  userId: string;
  questionIndex: number;
  questionId: number;
  answerText: string | null;
}): Promise<Record<string, unknown>> {
  const { data, error } = await withGameTimeout(
    supabase.rpc("submit_ranked_answer", {
      p_match_id: params.matchId,
      p_user_id: params.userId,
      p_question_index: params.questionIndex,
      p_question_id: params.questionId,
      p_answer_text: params.answerText,
      p_guest_token: gameGuestToken(params.userId),
    }),
    "submit ranked answer",
  );
  if (error) throw error;
  const row = rpcRow(data);
  if (!row) throw new Error("Ranked answer returned no match");
  return row as Record<string, unknown>;
}

export async function advanceRankedMatch(
  matchId: string,
  userId: string,
  fromQuestion: number,
): Promise<Record<string, unknown>> {
  const { data, error } = await withGameTimeout(
    supabase.rpc("start_or_advance_ranked_match", {
      p_match_id: matchId,
      p_user_id: userId,
      p_from_question: fromQuestion,
      p_guest_token: gameGuestToken(userId),
    }),
    "advance ranked match",
  );
  if (error) throw error;
  const row = rpcRow(data);
  if (!row) throw new Error("Ranked advance returned no match");
  return row as Record<string, unknown>;
}

export async function startDailyAttempt(params: {
  userId: string;
  displayName: string;
  country: string;
}): Promise<DailyAttempt> {
  const { data, error } = await withGameTimeout(
    supabase.rpc("start_daily_attempt", {
      p_user_id: params.userId,
      p_display_name: params.displayName,
      p_country: params.country,
      p_guest_token: gameGuestToken(params.userId),
    }),
    "start daily attempt",
  );
  if (error) throw error;
  const row = rpcRow(data);
  if (!row) throw new Error("Daily attempt returned no row");
  return row as DailyAttempt;
}

export async function submitDailyAnswer(params: {
  attemptId: string;
  userId: string;
  questionIndex: number;
  questionId: number;
  answerText: string | null;
}): Promise<DailyAttempt> {
  const { data, error } = await withGameTimeout(
    supabase.rpc("submit_daily_answer", {
      p_attempt_id: params.attemptId,
      p_user_id: params.userId,
      p_question_index: params.questionIndex,
      p_question_id: params.questionId,
      p_answer_text: params.answerText,
      p_guest_token: gameGuestToken(params.userId),
    }),
    "submit daily answer",
  );
  if (error) throw error;
  const row = rpcRow(data);
  if (!row) throw new Error("Daily answer returned no attempt");
  return row as DailyAttempt;
}

// ──────────────────────────── LEADERBOARD: MY RANK ────────────────────────────
// Counts how many distinct usernames have a higher best score than mine,
// returning my 1-based rank (or null if I have no scores).
export async function getMyAllTimeRank(username: string, category?: string): Promise<number | null> {
  let mineQ = supabase
    .from("scores")
    .select("score")
    .eq("username", username)
    .order("score", { ascending: false })
    .limit(1);
  if (category && category !== "all") mineQ = mineQ.eq("category", category);
  const { data: mine } = await mineQ;
  const myBest = mine?.[0]?.score;
  if (myBest == null) return null;
  let higherQ = supabase
    .from("scores")
    .select("username, score")
    .gt("score", myBest)
    .limit(2000);
  if (category && category !== "all") higherQ = higherQ.eq("category", category);
  const { data: higher } = await higherQ;
  const distinctHigher = new Set((higher ?? []).map((r: any) => r.username));
  return distinctHigher.size + 1;
}

export async function getMyWeeklyRank(username: string, category?: string): Promise<number | null> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  let mineQ = supabase
    .from("scores")
    .select("score")
    .eq("username", username)
    .gte("created_at", weekAgo)
    .order("score", { ascending: false })
    .limit(1);
  if (category && category !== "all") mineQ = mineQ.eq("category", category);
  const { data: mine } = await mineQ;
  const myBest = mine?.[0]?.score;
  if (myBest == null) return null;
  let higherQ = supabase
    .from("scores")
    .select("username, score")
    .gte("created_at", weekAgo)
    .gt("score", myBest)
    .limit(2000);
  if (category && category !== "all") higherQ = higherQ.eq("category", category);
  const { data: higher } = await higherQ;
  const distinctHigher = new Set((higher ?? []).map((r: any) => r.username));
  return distinctHigher.size + 1;
}

// ──────────────────────────── PENDING CHALLENGES ────────────────────────────
/** Number of challenges I created that are still waiting for an opponent. */
export async function getMyPendingChallengesCount(creatorId: string): Promise<number> {
  const { count, error } = await supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .eq("status", "pending");
  if (error) { console.error("getMyPendingChallengesCount error", error); return 0; }
  return count ?? 0;
}

/** Full rows of challenges I created that are still pending. */
export async function getMyPendingChallenges(creatorId: string, limit = 50): Promise<DbChallenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select(CHALLENGE_COLUMNS)
    .eq("creator_id", creatorId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) { console.error("getMyPendingChallenges error", error); return []; }
  return (data as DbChallenge[]) ?? [];
}

/** Delete a *pending* challenge (only the creator should call this).
 *  Guarded by status = 'pending' so a challenge that was just completed
 *  between list load and delete click is not destroyed.
 */
export async function deleteDbChallenge(id: string, creatorId: string): Promise<boolean> {
  const { error, count } = await supabase
    .from("challenges")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("creator_id", creatorId)
    .eq("status", "pending");
  if (error) { console.error("deleteDbChallenge error", error); return false; }
  return (count ?? 0) > 0;
}
