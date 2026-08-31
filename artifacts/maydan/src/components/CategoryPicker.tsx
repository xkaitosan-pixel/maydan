import { useState, useEffect } from "react";
import CategoryCard from "./CategoryCard";
import { CategoryNode, fetchCategoryTree } from "@/lib/categoriesService";

interface CategoryPickerProps {
  onSelect: (categoryId: string) => void;
  isPremium: boolean;
  size?: "default" | "small";
  includeMix?: boolean;
  multiSelect?: boolean;
  selectedIds?: string[];
  onToggle?: (categoryId: string) => void;
  initialParent?: string | null;
}

export default function CategoryPicker({
  onSelect,
  isPremium,
  size = "default",
  includeMix = false,
  multiSelect = false,
  selectedIds = [],
  onToggle,
  initialParent = null
}: CategoryPickerProps) {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [navParent, setNavParent] = useState<CategoryNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetchCategoryTree()
      .then(t => {
        if (!active) return;
        setTree(t);
        if (initialParent) {
          const root = t.find(r => r.id === initialParent);
          if (root && root.children?.length > 0) setNavParent(root);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [initialParent]);

  if (loading) {
    return <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-primary/40 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (error) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center text-sm text-red-200">تعذر تحميل الفئات. حاول تحديث الصفحة.</div>;
  }
  if (tree.length === 0) {
    return <div className="rounded-2xl border border-white/10 bg-card/60 p-6 text-center text-sm text-muted-foreground">لا توجد فئات متاحة حاليًا.</div>;
  }

  const mixTile = {
    id: "mix", name: "مزيج كل الفئات", icon: "🎲",
    gradientFrom: "#9333ea", gradientTo: "#ec4899",
    isPremium: false, parentKey: null, children: [] as CategoryNode[]
  };

  const visible: CategoryNode[] = navParent 
    ? navParent.children 
    : (includeMix ? [mixTile as CategoryNode, ...tree] : tree);

  return (
    <div className="w-full">
      {navParent && (
        <div className="mb-4 fade-in-up">
          <button 
            onClick={() => setNavParent(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3 font-bold"
          >
            <span className="text-xl">←</span> <span>رجوع للفئات الرئيسية</span>
          </button>
          
          <div className="flex items-center gap-4 bg-card/60 backdrop-blur-md border border-white/10 p-4 rounded-3xl shadow-xl">
            <span className="text-5xl drop-shadow-md">{navParent.icon}</span>
            <div>
              <h3 className="font-black text-xl text-white">{navParent.name}</h3>
              <p className="text-[11px] font-bold text-white/60 mt-0.5">اختر فئة فرعية أو الكل</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 fade-in-up">
        {navParent && (
          <CategoryCard
            cat={{
              ...navParent,
              name: "كل " + navParent.name,
              icon: "🌟"
            } as any}
            isSelected={multiSelect && selectedIds.includes(navParent.id)}
            isLocked={
              !isPremium &&
              (!!navParent.isPremium || navParent.children.some((child) => !!child.isPremium))
            }
            questionCount={navParent.questionCount ?? 50}
            onClick={() => {
              if (
                !isPremium &&
                (!!navParent.isPremium || navParent.children.some((child) => !!child.isPremium))
              ) return;
              if (multiSelect && onToggle) onToggle(navParent.id);
              else onSelect(navParent.id);
            }}
            size={size}
          />
        )}
        
        {visible.map((cat) => {
          const hasChildren = (cat.children?.length ?? 0) > 0;
          // A mixed-entitlement parent remains navigable so free children are reachable.
          // Only the aggregate "All" card above includes every child and inherits their lock.
          const isLocked = !isPremium && !!cat.isPremium;
          const isSelected = multiSelect && selectedIds.includes(cat.id);
          
          return (
            <div key={cat.id} className="relative">
              <CategoryCard
                cat={cat as any}
                isSelected={isSelected}
                isLocked={isLocked}
                questionCount={cat.id === "mix" ? 225 : (cat.questionCount ?? 15)}
                onClick={() => {
                  if (isLocked) return;
                  if (hasChildren) {
                    setNavParent(cat);
                  } else {
                    if (multiSelect && onToggle) onToggle(cat.id);
                    else onSelect(cat.id);
                  }
                }}
                size={size}
              />
              {hasChildren && !isLocked && (
                <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded-full pointer-events-none font-bold shadow-md">
                  {cat.children.length} ›
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
