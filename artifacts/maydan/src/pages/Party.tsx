import { useLocation } from "wouter";

export default function Party() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center fade-in-up">
        <div className="w-24 h-24 rounded-full gradient-gold gold-glow flex items-center justify-center mx-auto mb-4">
          <span className="text-5xl">📺</span>
        </div>
        <h1 className="text-3xl font-black text-primary">وضع التجمعات</h1>
        <p className="text-muted-foreground text-sm mt-2">العب مع أصدقائك في نفس المكان</p>
        <p className="text-xs text-muted-foreground mt-1">المضيف يعرض على الشاشة الكبيرة • اللاعبون يجيبون من هواتفهم</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => navigate("/party/host")}
          className="w-full h-24 rounded-2xl font-black text-background flex flex-col items-center justify-center gap-1 hover:opacity-90 active:scale-95 transition-all"
          style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
        >
          <span className="text-3xl">📺</span>
          <span className="text-xl">أنشئ غرفة</span>
          <span className="text-xs font-normal opacity-80">أنت المضيف</span>
        </button>

        <button
          onClick={() => navigate("/party/guest")}
          className="w-full h-24 rounded-2xl font-black text-background flex flex-col items-center justify-center gap-1 hover:opacity-90 active:scale-95 transition-all"
          style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)" }}
        >
          <span className="text-3xl">🎮</span>
          <span className="text-xl">انضم لغرفة</span>
          <span className="text-xs font-normal opacity-80">أدخل رمز الغرفة</span>
        </button>
      </div>

      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4">
        <p className="text-xs font-bold text-muted-foreground mb-2 text-center">كيف يعمل؟</p>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p>📺 المضيف يفتح غرفة ويشارك الرمز</p>
          <p>🎮 اللاعبون ينضمون من هواتفهم</p>
          <p>❓ الأسئلة تظهر عند المضيف</p>
          <p>👆 اللاعبون يجيبون من هواتفهم</p>
          <p>🏆 المتصدر يفوز!</p>
        </div>
      </div>

      <button onClick={() => navigate("/")} className="text-muted-foreground text-sm hover:text-foreground transition-colors">
        ← العودة للقائمة الرئيسية
      </button>
    </div>
  );
}
