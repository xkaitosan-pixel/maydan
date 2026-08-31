import { supabase } from "./supabase";
import { Question } from "./questions";
import { cacheQuestionsForOffline, getOfflineQuestions } from "./offlineQuestions";
import { resolveCategorySelection } from "./categoriesService";

const CACHE_TTL_MS = 10 * 60_000;
const QUESTION_PAGE_SIZE = 1_000;
const MAX_CATEGORY_PAGES = 5;
const QUESTION_ID_BATCH_SIZE = 200;
const QUESTION_COLUMNS = "id, question, options, correct, category, difficulty, image_url";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const categoryCache = new Map<string, CacheEntry<Question[]>>();
const categoryInflight = new Map<string, Promise<Question[]>>();
const selectionCache = new Map<string, CacheEntry<Question[]>>();
const selectionInflight = new Map<string, Promise<Question[]>>();
const countCache = new Map<string, CacheEntry<number>>();
const countInflight = new Map<string, Promise<number>>();
const idsCache = new Map<string, CacheEntry<Question[]>>();
const idsInflight = new Map<string, Promise<Question[]>>();
const questionCache = new Map<number, CacheEntry<Question>>();

export function invalidateQuestionCaches() {
  categoryCache.clear();
  categoryInflight.clear();
  selectionCache.clear();
  selectionInflight.clear();
  countCache.clear();
  countInflight.clear();
  idsCache.clear();
  idsInflight.clear();
  questionCache.clear();
}

function freshValue<T>(entry: CacheEntry<T> | undefined): T | undefined {
  return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
}

function rememberQuestions(questions: Question[], expiresAt: number) {
  for (const question of questions) {
    questionCache.set(question.id, { value: question, expiresAt });
  }
  cacheQuestionsForOffline(questions);
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

function seedHash(seed: string): number {
  let hash = 0;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 0x9e3779b9);
  return hash >>> 0;
}

type Difficulty = Question["difficulty"];
export type CategorySelection = string | readonly string[];

interface ResolvedSelection {
  keys: string[];
  cacheKey: string;
  isMix: boolean;
}

async function resolveSelection(category: CategorySelection): Promise<ResolvedSelection> {
  if (category === "mix" || (Array.isArray(category) && category.includes("mix"))) {
    return { keys: [], cacheKey: "mix", isMix: true };
  }
  const keys = await resolveCategorySelection(category);
  const uniqueKeys = [...new Set(keys)].sort();
  return { keys: uniqueKeys, cacheKey: uniqueKeys.join(","), isMix: false };
}

function filteredQuestionQuery(difficulty?: Difficulty) {
  let query = supabase
    .from("questions")
    .select(QUESTION_COLUMNS)
    .order("id");

  if (difficulty) query = query.eq("difficulty", difficulty);
  return query;
}

function applyCategoryFilter<T extends {
  eq: (column: string, value: string) => T;
  neq: (column: string, value: string) => T;
  in: (column: string, values: string[]) => T;
}>(
  query: T,
  selection: ResolvedSelection,
): T {
  return selection.isMix
    ? query.neq("category", "legends")
    : selection.keys.length === 1
      ? query.eq("category", selection.keys[0])
      : query.in("category", selection.keys);
}

function offlineSelection(selection: ResolvedSelection): string | readonly string[] {
  return selection.isMix ? "mix" : selection.keys;
}

function selectionKey(selection: ResolvedSelection, difficulty?: Difficulty): string {
  return `${selection.cacheKey}|${difficulty ?? "all"}`;
}

async function countMatchingQuestions(selection: ResolvedSelection, difficulty?: Difficulty): Promise<number> {
  const key = selectionKey(selection, difficulty);
  const cached = freshValue(countCache.get(key));
  if (cached !== undefined) return cached;

  const pending = countInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    let query = supabase
      .from("questions")
      .select("id", { count: "exact", head: true });
    query = applyCategoryFilter(query, selection);
    if (difficulty) query = query.eq("difficulty", difficulty);

    const { count, error } = await query;
    if (error) {
      console.error("Failed to count questions:", error);
      return getOfflineQuestions({ category: offlineSelection(selection), difficulty }).length;
    }

    const value = count ?? 0;
    countCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  })();
  countInflight.set(key, request);
  try {
    return await request;
  } finally {
    countInflight.delete(key);
  }
}

async function fetchQuestionRange(
  selection: ResolvedSelection,
  start: number,
  end: number,
  difficulty?: Difficulty,
): Promise<Question[]> {
  let query = filteredQuestionQuery(difficulty).range(start, end);
  query = applyCategoryFilter(query, selection);
  const { data, error } = await query;
  if (error || !data) {
    console.error("Failed to load bounded question range:", error);
    return getOfflineQuestions({ category: offlineSelection(selection), difficulty }).slice(start, end + 1);
  }
  return data as Question[];
}

async function fetchBoundedSeededQuestions(
  category: CategorySelection,
  seed: string,
  count: number,
  difficulty?: Difficulty,
): Promise<Question[]> {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return [];

  const selection = await resolveSelection(category);
  const key = `${selectionKey(selection, difficulty)}|${seed}|${safeCount}`;
  const cached = freshValue(selectionCache.get(key));
  if (cached) return cached;

  const pending = selectionInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const total = await countMatchingQuestions(selection, difficulty);
    if (total === 0) {
      return seededShuffleQuestions(
        getOfflineQuestions({ category: offlineSelection(selection), difficulty }),
        seed,
      ).slice(0, safeCount);
    }

    const requested = Math.min(safeCount, total);
    const start = seedHash(seed) % total;
    const firstCount = Math.min(requested, total - start);
    const ranges = [fetchQuestionRange(selection, start, start + firstCount - 1, difficulty)];
    if (firstCount < requested) {
      ranges.push(fetchQuestionRange(selection, 0, requested - firstCount - 1, difficulty));
    }

    const loaded = (await Promise.all(ranges)).flat();
    const questions = seededShuffleQuestions(
      loaded.length ? loaded : getOfflineQuestions({ category: offlineSelection(selection), difficulty }),
      seed,
    ).slice(0, requested);
    const expiresAt = Date.now() + CACHE_TTL_MS;
    selectionCache.set(key, { value: questions, expiresAt });
    rememberQuestions(questions, expiresAt);
    return questions;
  })();
  selectionInflight.set(key, request);
  try {
    return await request;
  } finally {
    selectionInflight.delete(key);
  }
}

export async function loadCategoryQuestions(category: CategorySelection): Promise<Question[]> {
  const selection = await resolveSelection(category);
  const cacheKey = selection.cacheKey;
  const cached = freshValue(categoryCache.get(cacheKey));
  if (cached) return cached;

  const pending = categoryInflight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    if (!selection.isMix && selection.keys.length === 0) {
      return getOfflineQuestions({ category: [] });
    }
    const questions: Question[] = [];
    let offset = 0;

    for (let page = 0; page < MAX_CATEGORY_PAGES; page++) {
      let query = supabase
        .from("questions")
        .select(QUESTION_COLUMNS)
        .order("id")
        .range(offset, offset + QUESTION_PAGE_SIZE - 1);

      query = applyCategoryFilter(query, selection);

      const { data, error } = await query;
      if (error || !data) {
        console.error("Failed to load questions:", error);
        return getOfflineQuestions({ category: offlineSelection(selection) });
      }

      questions.push(...(data as Question[]));
      if (data.length < QUESTION_PAGE_SIZE) break;
      offset += QUESTION_PAGE_SIZE;
    }

    const expiresAt = Date.now() + CACHE_TTL_MS;
    categoryCache.set(cacheKey, { value: questions, expiresAt });
    rememberQuestions(questions, expiresAt);
    return questions;
  })();
  categoryInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    categoryInflight.delete(cacheKey);
  }
}

export async function fetchGameQuestions(category: CategorySelection, count?: number): Promise<Question[]> {
  if (count !== undefined) {
    const seed = `random_${Math.random().toString(36).slice(2)}`;
    return fetchBoundedSeededQuestions(category, seed, count);
  }
  const all = await loadCategoryQuestions(category);
  const shuffled = shuffleArray(all);
  return shuffled;
}

export async function fetchSeededQuestions(category: CategorySelection, seed: string, count: number): Promise<Question[]> {
  return fetchBoundedSeededQuestions(category, seed, count);
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
        return getOfflineQuestions({ ids: uniqueIds });
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
  const [easy, medium, hard] = await Promise.all([
    fetchBoundedSeededQuestions("mix", seed + "easy", 4, "easy"),
    fetchBoundedSeededQuestions("mix", seed + "med", 4, "medium"),
    fetchBoundedSeededQuestions("mix", seed + "hard", 2, "hard"),
  ]);
  return seededShuffleQuestions([...easy, ...medium, ...hard], seed);
}

export function clearQuestionCache() {
  categoryCache.clear();
  selectionCache.clear();
  countCache.clear();
  idsCache.clear();
  questionCache.clear();
  categoryInflight.clear();
  selectionInflight.clear();
  countInflight.clear();
  idsInflight.clear();
}
