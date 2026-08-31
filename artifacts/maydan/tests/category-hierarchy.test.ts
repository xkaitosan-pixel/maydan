import { describe, expect, it } from "vitest";
import {
  buildCategoryMap,
  buildCategoryTree,
  expandCategorySelection,
  getCategoryLabel,
  isCategorySelectionAllowed,
  type FlatCategory,
} from "@/lib/categoriesService";

const categories: FlatCategory[] = [
  { id: "sports", name: "Sports", icon: "⚽", gradient: "", gradientFrom: "", gradientTo: "", parentKey: null },
  { id: "football", name: "Football", icon: "⚽", gradient: "", gradientFrom: "", gradientTo: "", parentKey: "sports" },
  { id: "tennis", name: "Tennis", icon: "🎾", gradient: "", gradientFrom: "", gradientTo: "", parentKey: "sports" },
  { id: "science", name: "Science", icon: "🔬", gradient: "", gradientFrom: "", gradientTo: "", parentKey: null },
  { id: "orphan", name: "Orphan", icon: "?", gradient: "", gradientFrom: "", gradientTo: "", parentKey: "missing" },
];

describe("category hierarchy helpers", () => {
  it("builds a key map and an orphan-safe tree", () => {
    const tree = buildCategoryTree(categories);
    expect(buildCategoryMap(categories).get("football")?.name).toBe("Football");
    expect(tree.map((category) => category.id)).toEqual(["sports", "science", "orphan"]);
    expect(tree[0].children.map((category) => category.id)).toEqual(["football", "tennis"]);
  });

  it("expands parents, preserves leaf selections, and labels unknown keys", () => {
    expect(expandCategorySelection("sports", categories)).toEqual(["sports", "football", "tennis"]);
    expect(expandCategorySelection("football", categories)).toEqual(["football"]);
    expect(expandCategorySelection(["science", "football"], categories)).toEqual(["science", "football"]);
    expect(getCategoryLabel("football", categories)).toBe("Football");
    expect(getCategoryLabel("custom-key", categories)).toBe("custom-key");
  });

  it("locks a parent all-selection when any included child is premium", () => {
    const withPremiumChild: FlatCategory[] = [
      ...categories,
      { id: "premium-child", name: "Premium", icon: "👑", gradient: "", gradientFrom: "", gradientTo: "", parentKey: "sports", isPremium: true },
    ];
    expect(isCategorySelectionAllowed("sports", withPremiumChild, false)).toBe(false);
    expect(isCategorySelectionAllowed("football", withPremiumChild, false)).toBe(true);
    expect(isCategorySelectionAllowed("sports", withPremiumChild, true)).toBe(true);
  });
});