import type { DbChallenge } from "./db";
import type { ChallengeData } from "./storage";

function parseArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function challengeFromDb(row: DbChallenge): ChallengeData {
  const opponentAnswers = parseArray<number | null>(row.opponent_answers);
  return {
    id: row.id,
    creatorId: row.creator_id ?? "",
    creatorName: row.creator_name,
    categoryId: row.category,
    questionCount: row.question_count,
    questions: parseArray<number>(row.question_ids),
    creatorAnswers: parseArray<number | null>(row.creator_answers),
    creatorScore: row.creator_score ?? 0,
    creatorTime: 0,
    createdAt: row.created_at,
    status: row.status === "completed" ? "completed" : "waiting",
    challengerName: row.opponent_name ?? undefined,
    challengerAnswers: opponentAnswers.length ? opponentAnswers : undefined,
    challengerScore: row.opponent_score ?? undefined,
  };
}