import { supabase } from "./supabase";
import { Question } from "./questions";

const CACHE_TTL_MS = 10 * 60_000;
const QUESTION_PAGE_SIZE = 1_000;
const QUESTION_ID_BATCH_SIZE = 200;
const QUESTION_COLUMNS = "id, question, options, correct, category, difficulty, image_url";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const categoryCache = new Map<string, CacheEntry<Question[]>>();
const categoryInflight = new Map<string, Promise<Question[]>>();
const idsCache = new Map<string, CacheEntry<Question[]>>();
const idsInflight = new Map<string, Promise<Question[]>>();
const questionCache = new Map<number, CacheEntry<Question>>();

function freshValue<T>(entry: CacheEntry<T> | undefined): T | undefined {
  return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
}

function rememberQuestions(questions: Question[], expiresAt: number) {
  for (const question of questions) {
    questionCache.set(question.id, { value: question, expiresAt });
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function seededShuffleQuestions<T>(arr: T[], seed: string): T[] {
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

export async function loadCategoryQuestions(category: string): Promise<Question[]> {
  const cached = freshValue(categoryCache.get(category));
  if (cached) return cached;

  const pending = categoryInflight.get(category);
  if (pending) return pending;

  const request = (async () => {
    const questions: Question[] = [];
    let offset = 0;

    while (true) {
      let query = supabase
        .from("questions")
        .select(QUESTION_COLUMNS)
        .order("id")
        .range(offset, offset + QUESTION_PAGE_SIZE - 1);

      if (category === "mix") {
        query = query.neq("category", "legends");
      } else {
        query = query.eq("category", category);
      }

      const { data, error } = await query;
      if (error || !data) {
        console.error("Failed to load questions:", error);
        return [];
      }

      questions.push(...(data as Question[]));
      if (data.length < QUESTION_PAGE_SIZE) break;
      offset += QUESTION_PAGE_SIZE;
    }

    const expiresAt = Date.now() + CACHE_TTL_MS;
    categoryCache.set(category, { value: questions, expiresAt });
    rememberQuestions(questions, expiresAt);
    return questions;
  })();
  categoryInflight.set(category, request);
  try {
    return await request;
  } finally {
    categoryInflight.delete(category);
  }
}

export async function fetchGameQuestions(category: string, count?: number): Promise<Question[]> {
  const all = await loadCategoryQuestions(category);
  const shuffled = shuffleArray(all);
  return count ? shuffled.slice(0, count) : shuffled;
}

export async function fetchSeededQuestions(category: string, seed: string, count: number): Promise<Question[]> {
  const all = await loadCategoryQuestions(category);
  return seededShuffleQuestions(all, seed).slice(0, Math.min(count, all.length));
}

export async function fetchQuestionsByIds(ids: number[]): Promise<Question[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  const key = [...uniqueIds].sort((a, b) => a - b).join(",");
  const cachedResult = freshValue(idsCache.get(key));
  if (cachedResult) {
    const byId = new Map(cachedResult.map((question) => [question.id, question]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
  }

  const individuallyCached = uniqueIds
    .map((id) => freshValue(questionCache.get(id)))
    .filter(Boolean) as Question[];
  if (individuallyCached.length === uniqueIds.length) {
    const byId = new Map(individuallyCached.map((question) => [question.id, question]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
  }

  const pending = idsInflight.get(key);
  if (pending) {
    const questions = await pending;
    const byId = new Map(questions.map((question) => [question.id, question]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
  }

  const request = (async () => {
    const questions: Question[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += QUESTION_ID_BATCH_SIZE) {
      const batch = uniqueIds.slice(offset, offset + QUESTION_ID_BATCH_SIZE);
      const { data, error } = await supabase
        .from("questions")
        .select(QUESTION_COLUMNS)
        .in("id", batch);
      if (error || !data) {
        console.error("Failed to load questions by id:", error);
        return [];
      }
      questions.push(...(data as Question[]));
    }

    const expiresAt = Date.now() + CACHE_TTL_MS;
    idsCache.set(key, { value: questions, expiresAt });
    rememberQuestions(questions, expiresAt);
    const byId = new Map(questions.map((question) => [question.id, question]));
    return uniqueIds.map((id) => byId.get(id)).filter(Boolean) as Question[];
  })();
  idsInflight.set(key, request);
  try {
    const questions = await request;
    const byId = new Map(questions.map((question) => [question.id, question]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
  } finally {
    idsInflight.delete(key);
  }
}

export async function fetchMixedDifficultyDailyQuestions(seed: string): Promise<Question[]> {
  const all = await loadCategoryQuestions("mix");
  const easy = seededShuffleQuestions(all.filter((q) => q.difficulty === "easy"), seed + "easy").slice(0, 4);
  const medium = seededShuffleQuestions(all.filter((q) => q.difficulty === "medium"), seed + "med").slice(0, 4);
  const hard = seededShuffleQuestions(all.filter((q) => q.difficulty === "hard"), seed + "hard").slice(0, 2);
  return seededShuffleQuestions([...easy, ...medium, ...hard], seed);
}

export function clearQuestionCache() {
  categoryCache.clear();
  idsCache.clear();
  questionCache.clear();
  categoryInflight.clear();
  idsInflight.clear();
}
