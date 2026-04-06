import { supabase } from "./supabase";
import { Question } from "./questions";

const cache = new Map<string, Question[]>();

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
  if (cache.has(category)) return cache.get(category)!;

  let query = supabase.from("questions").select("*").order("id");

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

  const qs = data as Question[];
  cache.set(category, qs);
  return qs;
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

  const allCached = [...cache.values()].flat();
  const found = ids.map(id => allCached.find(q => q.id === id)).filter(Boolean) as Question[];
  if (found.length === ids.length) return found;

  const { data, error } = await supabase.from("questions").select("*").in("id", ids);
  if (error || !data) return [];

  const qs = data as Question[];
  ids.forEach(id => {
    const q = qs.find(q => q.id === id);
    if (q) {
      const catKey = q.category;
      if (!cache.has(catKey)) cache.set(catKey, []);
      const catCache = cache.get(catKey)!;
      if (!catCache.find(c => c.id === q.id)) catCache.push(q);
    }
  });

  return ids.map(id => qs.find(q => q.id === id)).filter(Boolean) as Question[];
}

export function clearQuestionCache() {
  cache.clear();
}
