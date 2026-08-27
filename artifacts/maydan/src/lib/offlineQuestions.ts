import type { Question } from "./questions";

const CACHE_KEY = "maydan_offline_questions_v1";
const MAX_CACHED_QUESTIONS = 300;

interface CachedQuestion {
  question: Question;
  cachedAt: number;
}

function readCache(): CachedQuestion[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cacheQuestionsForOffline(questions: Question[]): void {
  if (!questions.length) return;
  try {
    const byId = new Map<number, CachedQuestion>();
    for (const cached of readCache()) byId.set(cached.question.id, cached);
    const now = Date.now();
    for (const question of questions) {
      byId.set(question.id, { question, cachedAt: now });
    }
    const recent = [...byId.values()]
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .slice(0, MAX_CACHED_QUESTIONS);
    localStorage.setItem(CACHE_KEY, JSON.stringify(recent));
  } catch {
    // Quota or privacy-mode failures should never interrupt a game.
  }
}

export function getOfflineQuestions(params: {
  ids?: number[];
  category?: string;
  difficulty?: Question["difficulty"];
} = {}): Question[] {
  const ids = params.ids ? new Set(params.ids) : null;
  return readCache()
    .map((entry) => entry.question)
    .filter((question) => {
      if (ids && !ids.has(question.id)) return false;
      if (params.difficulty && question.difficulty !== params.difficulty) return false;
      if (params.category && params.category !== "mix" && question.category !== params.category) return false;
      if (params.category === "mix" && question.category === "legends") return false;
      return true;
    });
}