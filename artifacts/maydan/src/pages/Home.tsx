import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getOrCreateUser, updateDisplayName, canCreateChallenge, getRemainingChallenges } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const user = getOrCreateUser();
    if (user.displayName) {
      setName(user.displayName);
      setHasName(true);
    }
    setRemaining(getRemainingChallenges());
  }, []);

  function handleSaveName() {
    if (!name.trim()) return;
    updateDisplayName(name.trim());
    setHasName(true);
    setRemaining(getRemainingChallenges());
  }

  function handleCreateChallenge() {
    if (!canCreateChallenge()) return;
    navigate("/create");
  }

  const user = getOrCreateUser();
  const canCreate = canCreateChallenge();

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-background font-bold text-lg">
            م
          </div>
          <span className="text-xl font-bold text-primary">ميدان</span>
        </div>
        {hasName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>مرحباً، {user.displayName}</span>
            <span className="text-xs bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full border border-secondary/30">
              {user.isPremium ? "⭐ بريميوم" : `${remaining} تحدي متبقي`}
            </span>
          </div>
        )}
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center py-12">
        {/* Logo */}
        <div className="mb-8 relative">
          <div className="w-28 h-28 rounded-full gradient-gold flex items-center justify-center gold-glow mb-4 mx-auto">
            <span className="text-5xl font-black text-background">⚔️</span>
          </div>
          <h1 className="text-5xl font-black text-primary mb-2">ميدان</h1>
          <p className="text-secondary text-lg font-semibold">تحدي المعرفة ١ ضد ١</p>
        </div>

        {/* Tagline */}
        <p className="text-muted-foreground text-base max-w-sm mb-10 leading-relaxed">
          تحدى أصدقاءك في اختبار المعرفة! أجب على الأسئلة وشارك التحدي عبر واتساب
        </p>

        {/* Name input if no name */}
        {!hasName ? (
          <div className="w-full max-w-sm space-y-3 mb-8 fade-in-up">
            <p className="text-sm text-muted-foreground mb-2">أدخل اسمك للبدء:</p>
            <div className="flex gap-2">
              <Input
                className="text-right bg-card border-border"
                placeholder="اسمك هنا..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                maxLength={20}
              />
              <Button
                onClick={handleSaveName}
                disabled={!name.trim()}
                className="gradient-gold text-background font-bold hover:opacity-90"
              >
                ابدأ
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-3 fade-in-up">
            {/* Create Challenge */}
            <Button
              onClick={handleCreateChallenge}
              disabled={!canCreate}
              className="w-full h-14 text-lg font-bold gradient-gold text-background rounded-xl gold-glow hover:opacity-90 transition-opacity"
            >
              ⚔️ إنشاء تحدي جديد
            </Button>

            {!canCreate && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive text-center">
                وصلت للحد المجاني (5 تحديات يومياً)
                <br />
                <span className="text-xs text-muted-foreground">يتجدد الحد يومياً</span>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mt-6">
              {[
                { label: "إجمالي التحديات", value: user.totalChallenges },
                { label: "الانتصارات", value: user.wins },
                { label: "تحديات اليوم", value: user.challengesCreatedToday }
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-3 text-center card-hover">
                  <p className="text-2xl font-black text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Change name */}
            <button
              onClick={() => setHasName(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              تغيير الاسم
            </button>
          </div>
        )}

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-10">
          {[
            { icon: "⏱️", label: "30 ثانية\nللسؤال" },
            { icon: "📲", label: "مشاركة\nواتساب" },
            { icon: "🏆", label: "20 سؤالاً\nعربياً" }
          ].map((f) => (
            <div key={f.label} className="bg-card/50 border border-border/50 rounded-xl p-3 text-center">
              <span className="text-2xl">{f.icon}</span>
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line leading-tight">{f.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-muted-foreground border-t border-border/30">
        <span className="text-primary">ميدان</span> — النسخة المجانية: 5 تحديات يومياً
      </footer>
    </div>
  );
}
