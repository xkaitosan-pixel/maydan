import { useState } from "react";
import { useLocation } from "wouter";
import { CATEGORIES } from "@/lib/questions";
import { fetchGameQuestions } from "@/lib/questionService";
import { saveChallenge, incrementChallengesCount, generateId, getOrCreateUser, canCreateChallenge, getRemainingChallenges } from "@/lib/storage";
import CategoryCard from "@/components/CategoryCard";

export default function CreateChallenge() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"category" | "config">("category");

  const user = getOrCreateUser();
  const remaining = getRemainingChallenges();

  if (!canCreateChallenge()) {
    navigate("/");
    return null;
  }

  const filtered = CATEGORIES.filter(
    (c) =>
      c.name.includes(search) ||
      c.id.includes(search.toLowerCase())
  );

  function handleSelectCategory(id: string, isPremium?: boolean) {
    if (isPremium && !user.isPremium) return;
    setSelectedCategory(id);
    setStep("config");
  }

  async function handleStart() {
    if (!selectedCategory) return;
    const qs = await fetchGameQuestions(selectedCategory, questionCount);
    if (qs.length === 0) return;

    const challengeId = generateId();
    const challenge = {
      id: challengeId,
      creatorId: user.userId,
      creatorName: user.displayName || "مجهول",
      categoryId: selectedCategory,
      questionCount,
      questions: qs.map((q) => q.id),
      creatorAnswers: new Array(qs.length).fill(null),
      creatorScore: 0,
      creatorTime: 0,
      createdAt: new Date().toISOString(),
      status: "waiting" as const,
    };

    saveChallenge(challenge);
    incrementChallengesCount();
    navigate(`/quiz/${challengeId}/creator`);
  }

  const selectedCat = CATEGORIES.find((c) => c.id === selectedCategory);

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
                {[5, 10, 15].map((count) => (
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
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors text-xl">
            ←
          </button>
          <h1 className="text-lg font-bold">اختر فئة التحدي</h1>
          <span className="mr-auto text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
            {remaining === Infinity ? "∞" : remaining} متبقية
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-right pr-9 placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            placeholder="🔍 ابحث عن فئة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* Categories Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <p className="text-4xl mb-3">🔍</p>
            <p>لا توجد نتائج للبحث</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((cat) => {
              const isLocked = cat.isPremium && !user.isPremium;
              return (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  isLocked={isLocked}
                  questionCount={15}
                  onClick={() => handleSelectCategory(cat.id, cat.isPremium)}
                />
              );
            })}
          </div>
        )}

        {/* Premium Upsell */}
        {!user.isPremium && (
          <div className="mt-4 bg-gradient-to-r from-yellow-500/10 to-amber-400/10 border border-yellow-500/20 rounded-2xl p-4 text-center">
            <p className="text-sm font-bold text-yellow-400 mb-1">⭐ ترقية إلى بريميوم</p>
            <p className="text-xs text-muted-foreground">افتح فئة "تحدي الأساطير" وتحديات غير محدودة</p>
          </div>
        )}
      </div>
    </div>
  );
}
