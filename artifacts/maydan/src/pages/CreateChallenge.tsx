import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CATEGORIES, type Category } from "@/lib/questions";
import { fetchGameQuestions } from "@/lib/questionService";
import { fetchCategoriesFlat, validateCategorySelectionKey } from "@/lib/categoriesService";
import { saveChallenge, incrementChallengesCount, generateId, getOrCreateUser, canCreateChallenge, getRemainingChallenges } from "@/lib/storage";
import { createDbChallenge } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import CategoryPicker from "@/components/CategoryPicker";

export default function CreateChallenge() {
  const [, navigate] = useLocation();
  const { dbUser, googleDisplayName, isGuest } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"mode" | "category" | "config">("mode");
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);

  const searchParams = new URLSearchParams(window.location.search);
  const passedCat = searchParams.get("cat");

  const user = getOrCreateUser();
  const isPremium = !!(dbUser?.is_premium ?? user.isPremium);
  const remaining = getRemainingChallenges();

  useEffect(() => {
    fetchCategoriesFlat().then((cats) => setCategories(cats));
    if (passedCat) {
      void validateCategorySelectionKey(passedCat, isPremium).then((valid) => {
        if (!valid) return;
        setSelectedCategory(passedCat);
        setStep("config");
      });
    }
  }, [passedCat, isPremium]);

  if (!canCreateChallenge()) {
    navigate("/");
    return null;
  }

  const filtered = categories.filter(
    (c) =>
      c.name.includes(search) ||
      c.id.includes(search.toLowerCase())
  );

  function handleSelectCategory(id: string, premiumOnly?: boolean) {
    if (premiumOnly && !isPremium) return;
    setSelectedCategory(id);
    setStep("config");
  }

  async function handleStart() {
    if (!selectedCategory) return;
    const challengeId = generateId();
    let questionIds: number[];
    const creatorName =
      dbUser?.display_name ||
      dbUser?.username ||
      googleDisplayName ||
      user.displayName ||
      "لاعب";
    if (!isGuest && dbUser?.id) {
      try {
        const remote = await createDbChallenge({
          id: challengeId,
          creator_id: dbUser.id,
          creator_name: creatorName,
          category: selectedCategory,
          question_count: questionCount,
        });
        questionIds = JSON.parse(remote.question_ids) as number[];
      } catch (error) {
        console.error("[challenge] server creation failed", error);
        return;
      }
    } else {
      const qs = await fetchGameQuestions(selectedCategory, questionCount);
      if (qs.length === 0) return;
      questionIds = qs.map((question) => question.id);
    }
    const challenge = {
      id: challengeId,
      creatorId: user.userId,
      creatorName,
      categoryId: selectedCategory,
      questionCount,
      questions: questionIds,
      creatorAnswers: new Array(questionIds.length).fill(null),
      creatorScore: 0,
      creatorTime: 0,
      createdAt: new Date().toISOString(),
      status: "waiting" as const,
    };

    saveChallenge(challenge);
    incrementChallengesCount();

    navigate(`/quiz/${challengeId}/creator`);
  }

  const selectedCat = categories.find((c) => c.id === selectedCategory) ?? CATEGORIES.find((c) => c.id === selectedCategory);

  if (step === "mode") {
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors text-xl">←</button>
          <h1 className="text-lg font-bold">تحدي ثنائي</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4 fade-in-up">
            <div className="text-center mb-2">
              <span className="text-5xl">⚔️</span>
              <p className="text-muted-foreground text-sm mt-2">اختر نوع التحدي</p>
            </div>

            <button
              onClick={() => setStep("category")}
              className="w-full rounded-2xl p-5 text-right hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">👥</span>
                <div className="flex-1">
                  <p className="text-white font-black text-base">تحدي صديق</p>
                  <p className="text-white/75 text-xs mt-0.5">أرسل رابط التحدي عبر واتساب</p>
                </div>
                <span className="text-white/60 text-2xl">←</span>
              </div>
            </button>

            <button
              onClick={() => navigate("/ranked")}
              className="w-full rounded-2xl p-5 text-right hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, #7c2d12, #c2410c)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎯</span>
                <div className="flex-1">
                  <p className="text-white font-black text-base">تحدي عشوائي</p>
                  <p className="text-white/75 text-xs mt-0.5">جد خصمًا عبر الإنترنت — مصنّف ⚡</p>
                </div>
                <span className="text-white/60 text-2xl">←</span>
              </div>
            </button>

            <p className="text-xs text-muted-foreground text-center pt-2">
              التحديات المتبقية اليوم: <span className="text-primary font-bold">{remaining === Infinity ? "∞" : remaining}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (step === "config" && selectedCat) {
    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => setStep("category")} className="text-muted-foreground hover:text-foreground transition-colors text-xl">
            ←
          </button>
          <h1 className="text-lg font-bold">إعداد التحدي</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-5 fade-in-up">
            {/* Category display */}
            <div
              className="rounded-2xl p-5 text-center"
              style={{ background: `linear-gradient(135deg, ${selectedCat.gradientFrom}, ${selectedCat.gradientTo})` }}
            >
              <span className="text-5xl">{selectedCat.icon}</span>
              <p className="text-white font-black text-xl mt-2">{selectedCat.name}</p>
            </div>

            {/* Question count */}
            <div>
              <p className="text-sm text-muted-foreground mb-3 text-center">عدد الأسئلة</p>
              <div className="grid grid-cols-3 gap-3">
                {[10, 15, 20].map((count) => (
                  <button
                    key={count}
                    onClick={() => setQuestionCount(count)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      questionCount === count
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="block text-2xl font-black">{count}</span>
                    <span className="text-xs">سؤال</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الوقت لكل سؤال</span>
                <span className="text-primary font-bold">30 ثانية</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">التحديات المتبقية اليوم</span>
                <span className="text-primary font-bold">{remaining === Infinity ? "∞" : remaining}</span>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4">
              <p className="text-secondary text-sm font-bold mb-2">كيف يعمل؟</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>أجب على الأسئلة أولاً</li>
                <li>شارك الرابط مع صديقك</li>
                <li>يجيب صديقك على نفس الأسئلة</li>
                <li>اكتشف من الفائز!</li>
              </ol>
            </div>

            <button
              onClick={handleStart}
              className="w-full h-14 text-lg font-bold rounded-xl text-background hover:opacity-90 transition-opacity"
              style={{ background: `linear-gradient(135deg, ${selectedCat.gradientFrom}, ${selectedCat.gradientTo})` }}
            >
              🚀 ابدأ التحدي
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("mode")} className="text-muted-foreground hover:text-foreground transition-colors text-xl font-bold">
            ←
          </button>
          <h1 className="text-lg font-bold">اختر فئة التحدي</h1>
          <span className="mr-auto text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
            {remaining === Infinity ? "∞" : remaining} متبقية
          </span>
        </div>
      </header>

      {/* Categories Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <CategoryPicker
          onSelect={(id) => handleSelectCategory(id, false)} // The picker handles premium internally
          isPremium={isPremium}
          includeMix={false}
        />

        {/* Premium Upsell */}
        {!isPremium && (
          <div className="mt-4 bg-gradient-to-r from-yellow-500/10 to-amber-400/10 border border-yellow-500/20 rounded-2xl p-4 text-center">
            <p className="text-sm font-bold text-yellow-400 mb-1">⭐ ترقية إلى بريميوم</p>
            <p className="text-xs text-muted-foreground">افتح الفئات الحصرية وتحديات غير محدودة</p>
          </div>
        )}
      </div>
    </div>
  );
}
