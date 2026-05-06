import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen gradient-hero star-bg flex flex-col items-center justify-center gap-6 p-6 text-center"
      dir="rtl"
    >
      <div className="gold-glow rounded-3xl mb-2">
        <img src="/logo.png" alt="ميدان" className="app-logo" style={{ width: 80, height: "auto" }} />
      </div>

      <div className="text-7xl font-black text-primary leading-none" aria-hidden>
        ٤٠٤
      </div>

      <div>
        <h1 className="text-2xl font-black mb-2">الصفحة غير موجودة</h1>
        <p className="text-muted-foreground text-sm leading-7 max-w-xs">
          عذراً، الصفحة التي تبحث عنها غير متاحة.
          ربما تم نقلها أو حُذف الرابط.
        </p>
      </div>

      <div className="flex flex-col items-stretch gap-2 w-full max-w-xs">
        <button
          onClick={() => navigate("/")}
          className="h-12 rounded-xl gradient-gold text-background font-bold"
        >
          🏠 العودة للرئيسية
        </button>
        <button
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
          className="h-11 rounded-xl border border-border bg-card/60 text-foreground font-bold text-sm hover:bg-card transition-colors"
        >
          ← الصفحة السابقة
        </button>
      </div>
    </div>
  );
}
