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

export function invalidateCategoryCaches() {
  flatCache = null;
  flatInflight = null;
  treeCache = null;
  treeInflight = null;
  countsCache = null;
  countsInflight = null;
}

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

export type FlatCategory = Category & { parentKey: string | null };

/** Build a key-indexed view without making callers depend on array ordering. */
export function buildCategoryMap(categories: readonly FlatCategory[]): Map<string, FlatCategory> {
  return new Map(categories.map((category) => [category.id, category]));
}

/** Builds an orphan-safe tree from database (or fallback) category rows. */
export function buildCategoryTree(categories: readonly FlatCategory[]): CategoryNode[] {
  const byKey = new Map<string, CategoryNode>();
  for (const category of categories) {
    byKey.set(category.id, { ...category, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of byKey.values()) {
    const parent = node.parentKey ? byKey.get(node.parentKey) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Adds direct question counts to leaves and inclusive counts to their parents. */
export function applyQuestionCountsToTree(
  roots: readonly CategoryNode[],
  counts: Readonly<Record<string, number>>,
): CategoryNode[] {
  const withCounts = (node: CategoryNode): CategoryNode => {
    const children = node.children.map(withCounts);
    return {
      ...node,
      children,
      questionCount: (counts[node.id] ?? 0) + children.reduce(
        (total, child) => total + (child.questionCount ?? 0),
        0,
      ),
    };
  };
  return roots.map(withCounts);
}

/** Returns the display label for a category key, retaining usable unknown keys. */
export function getCategoryLabel(key: string, categories: readonly FlatCategory[]): string {
  return buildCategoryMap(categories).get(key)?.name ?? key;
}

/**
 * A selected parent includes itself and its currently active direct children.
 * A child (and a parent without children) remains a single-key selection.
 */
export function expandCategorySelection(
  selection: string | readonly string[],
  categories: readonly FlatCategory[],
): string[] {
  const byKey = buildCategoryMap(categories);
  const selected = Array.isArray(selection) ? selection : [selection];
  const keys = new Set<string>();
  for (const key of selected) {
    keys.add(key);
    if (!byKey.has(key)) continue;
    for (const category of categories) {
      if (category.parentKey === key) keys.add(category.id);
    }
  }
  return [...keys];
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
export async function fetchCategoriesFlat(): Promise<FlatCategory[]> {
  if (isFresh(flatCache)) return flatCache.value;
  if (flatInflight) return flatInflight;
  flatInflight = (async () => {
    let result: FlatCategory[];
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
    const roots = buildCategoryTree(await fetchCategoriesFlat());
    const counts = await fetchQuestionCounts();
    const countedRoots = applyQuestionCountsToTree(roots, counts);
    treeCache = { value: countedRoots, expiresAt: Date.now() + CACHE_TTL_MS };
    return countedRoots;
  })();
  try {
    return await treeInflight;
  } finally {
    treeInflight = null;
  }
}

/** Fetches the current database-first key map. */
export async function fetchCategoryMap(): Promise<Map<string, FlatCategory>> {
  return buildCategoryMap(await fetchCategoriesFlat());
}

/** Resolves a UI category selection to concrete question category keys. */
export async function resolveCategorySelection(
  selection: string | readonly string[],
): Promise<string[]> {
  if (selection === "mix") return ["mix"];
  return expandCategorySelection(selection, await fetchCategoriesFlat());
}

/** Validates route-provided selections against the visible catalogue and entitlement. */
export async function validateCategorySelectionKey(
  key: string,
  isPremium: boolean,
): Promise<boolean> {
  if (key === "mix") return true;
  const categories = await fetchCategoriesFlat();
  return isCategorySelectionAllowed(key, categories, isPremium);
}

export function isCategorySelectionAllowed(
  key: string,
  categories: readonly FlatCategory[],
  isPremium: boolean,
): boolean {
  const category = categories.find((item) => item.id === key);
  if (!category) return false;
  const selectionIncludesPremium =
    !!category.isPremium ||
    categories.some((item) => item.parentKey === key && item.isPremium);
  return isPremium || !selectionIncludesPremium;
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
