import { supabase } from "./supabase";
import { CATEGORIES, type Category } from "./questions";

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CATEGORIES = 500;
const MAX_COUNT_ROWS = 5_000;
const CATEGORY_COLUMNS = "id, name, key, icon, parent_key, is_premium, sort_order, created_at";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let flatCache: CacheEntry<Array<Category & { parentKey: string | null }>> | null = null;
let flatInflight: Promise<Array<Category & { parentKey: string | null }>> | null = null;
let treeCache: CacheEntry<CategoryNode[]> | null = null;
let treeInflight: Promise<CategoryNode[]> | null = null;
let countsCache: CacheEntry<Record<string, number>> | null = null;
let countsInflight: Promise<Record<string, number>> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > Date.now();
}

export interface DbCategory {
  id: string;
  name: string;
  key: string;
  icon: string | null;
  parent_key: string | null;
  is_premium: boolean;
  sort_order: number;
  created_at?: string;
}

export interface CategoryNode extends Category {
  parentKey: string | null;
  children: CategoryNode[];
  questionCount?: number;
}

const FALLBACK_GRADIENTS: Array<[string, string, string]> = [
  ["from-purple-800 to-purple-950", "#4a1a6b", "#2a0d3d"],
  ["from-blue-800 to-blue-950",     "#1a3a6b", "#0d1f3d"],
  ["from-emerald-800 to-emerald-950","#1a6b3c", "#0d3d22"],
  ["from-orange-800 to-orange-950", "#6b3a1a", "#3d1f0d"],
  ["from-red-800 to-red-950",       "#6b1a1a", "#3d0d0d"],
  ["from-cyan-800 to-cyan-950",     "#1a5a6b", "#0d2d3d"],
  ["from-pink-800 to-pink-950",     "#6b1a4a", "#3d0d2a"],
  ["from-indigo-800 to-indigo-950", "#1a2a6b", "#0d152d"],
];

function gradientFor(key: string): { gradient: string; gradientFrom: string; gradientTo: string } {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const [g, gf, gt] = FALLBACK_GRADIENTS[h % FALLBACK_GRADIENTS.length];
  return { gradient: g, gradientFrom: gf, gradientTo: gt };
}

function dbRowToCategory(row: DbCategory): Category & { parentKey: string | null } {
  const known = CATEGORIES.find((c) => c.id === row.key);
  const grad = known
    ? { gradient: known.gradient, gradientFrom: known.gradientFrom, gradientTo: known.gradientTo }
    : gradientFor(row.key);
  return {
    id: row.key,
    name: row.name,
    icon: row.icon || known?.icon || "🎯",
    isPremium: !!row.is_premium,
    parentKey: row.parent_key || null,
    ...grad,
  };
}

/**
 * Returns the full flat category list — DB rows when the `categories` table
 * exists and has rows, otherwise the hard-coded fallback in `questions.ts`.
 * Each item also exposes `parentKey` (null for top-level).
 */
export async function fetchCategoriesFlat(): Promise<Array<Category & { parentKey: string | null }>> {
  if (isFresh(flatCache)) return flatCache.value;
  if (flatInflight) return flatInflight;
  flatInflight = (async () => {
    let result: Array<Category & { parentKey: string | null }>;
    try {
      const { data, error } = await supabase
        .from("categories")
        .select(CATEGORY_COLUMNS)
        .order("sort_order")
        .order("name")
        .limit(MAX_CATEGORIES);
      result = !error && data && data.length > 0
        ? (data as DbCategory[]).map(dbRowToCategory)
        : CATEGORIES.map((c) => ({ ...c, parentKey: null }));
    } catch (e) {
      console.warn("[categoriesService] fetch failed, using fallback", e);
      result = CATEGORIES.map((c) => ({ ...c, parentKey: null }));
    }
    flatCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  })();
  try {
    return await flatInflight;
  } finally {
    flatInflight = null;
  }
}

/**
 * Returns categories grouped as a tree: top-level parents with their children.
 * Categories whose `parent_key` doesn't match any other category are treated
 * as top-level (orphan-safe).
 */
export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  if (isFresh(treeCache)) return treeCache.value;
  if (treeInflight) return treeInflight;
  treeInflight = (async () => {
    const flat = await fetchCategoriesFlat();
    const byKey = new Map<string, CategoryNode>();
    for (const c of flat) {
      byKey.set(c.id, { ...c, parentKey: c.parentKey, children: [] });
    }
    const roots: CategoryNode[] = [];
    for (const node of byKey.values()) {
      if (node.parentKey && byKey.has(node.parentKey)) {
        byKey.get(node.parentKey)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    treeCache = { value: roots, expiresAt: Date.now() + CACHE_TTL_MS };
    return roots;
  })();
  try {
    return await treeInflight;
  } finally {
    treeInflight = null;
  }
}

/**
 * Returns a map of category-key → live question count from the `questions`
 * table. Empty map on failure.
 */
export async function fetchQuestionCounts(): Promise<Record<string, number>> {
  if (isFresh(countsCache)) return countsCache.value;
  if (countsInflight) return countsInflight;
  countsInflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("questions")
        .select("category")
        .limit(MAX_COUNT_ROWS);
      if (error || !data) return {};
      const counts: Record<string, number> = {};
      for (const row of data as Array<{ category: string }>) {
        counts[row.category] = (counts[row.category] || 0) + 1;
      }
      countsCache = { value: counts, expiresAt: Date.now() + CACHE_TTL_MS };
      return counts;
    } catch {
      return {};
    }
  })();
  try {
    return await countsInflight;
  } finally {
    countsInflight = null;
  }
}
