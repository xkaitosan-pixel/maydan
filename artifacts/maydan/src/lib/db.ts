import { supabase } from "./supabase";
import type { DbUser } from "./AuthContext";

// ──────────────────────────── SCORES / LEADERBOARD ────────────────────────────

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
  const { data, error } = await supabase.from("scores").insert(payload).select();
  if (error) {
    console.error("[ميدان] insertScore FAILED ✗", error.code, error.message, error.details);
    return false;
  }
  console.log("[ميدان] Score saved ✓", { username: entry.username, score: entry.score, mode: entry.game_mode, id: data?.[0]?.id });
  return true;
}

export async function getWeeklyLeaderboard(category?: string): Promise<ScoreEntry[]> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  let q = supabase
    .from("scores")
    .select("*")
    .gte("created_at", weekAgo)
    .order("score", { ascending: false })
    .limit(50);
  if (category && category !== "all") q = q.eq("category", category);
  const { data, error } = await q;
  if (error) console.error("[ميدان] getWeeklyLeaderboard error", error.message);
  return dedupeByUsername(data ?? []);
}

export async function getAllTimeLeaderboard(category?: string): Promise<ScoreEntry[]> {
  let q = supabase
    .from("scores")
    .select("*")
    .order("score", { ascending: false })
    .limit(200);
  if (category && category !== "all") q = q.eq("category", category);
  const { data, error } = await q;
  if (error) console.error("[ميدان] getAllTimeLeaderboard error", error.message);
  return dedupeByUsername(data ?? []);
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
}): Promise<void> {
  // Fetch current values then increment
  const { data: current } = await supabase
    .from("users")
    .select("total_wins, total_losses, total_points")
    .eq("id", userId)
    .single();
  if (!current) return;

  const { error } = await supabase
    .from("users")
    .update({
      total_wins: current.total_wins + (delta.total_wins ?? 0),
      total_losses: current.total_losses + (delta.total_losses ?? 0),
      total_points: current.total_points + (delta.total_points ?? 0),
    })
    .eq("id", userId);

  if (error) console.error("updateUserStats error", error);
}

export async function setPremiumStatus(userId: string, isPremium: boolean): Promise<DbUser | null> {
  const { data } = await supabase
    .from("users")
    .update({ is_premium: isPremium })
    .eq("id", userId)
    .select()
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
}

export async function createDbChallenge(params: {
  creator_id: string | null;
  creator_name: string;
  category: string;
  question_ids: number[];
  creator_answers: (number | null)[];
  creator_score: number;
  question_count: number;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("challenges")
    .insert({
      creator_id: params.creator_id,
      creator_name: params.creator_name,
      category: params.category,
      question_ids: JSON.stringify(params.question_ids),
      creator_answers: JSON.stringify(params.creator_answers),
      creator_score: params.creator_score,
      question_count: params.question_count,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) { console.error("createDbChallenge error", error); return null; }
  return data?.id ?? null;
}

export async function getDbChallenge(id: string): Promise<DbChallenge | null> {
  const { data } = await supabase
    .from("challenges")
    .select("*")
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
  const { error } = await supabase
    .from("challenges")
    .update({
      opponent_id: params.opponent_id ?? null,
      opponent_name: params.opponent_name,
      opponent_answers: JSON.stringify(params.opponent_answers),
      opponent_score: params.opponent_score,
      status: "completed",
    })
    .eq("id", id);

  if (error) console.error("completeDbChallenge error", error);
}
