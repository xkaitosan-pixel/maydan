import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen gradient-hero flex flex-col items-center justify-center gap-6 p-6 text-center" dir="rtl">
      <div className="text-6xl">🔍</div>
      <div>
        <h1 className="text-3xl font-black mb-2">الصفحة غير موجودة</h1>
        <p className="text-muted-foreground">عذراً، الصفحة التي تبحث عنها غير متاحة</p>
      </div>
      <button
        onClick={() => navigate("/")}
        className="h-12 px-8 rounded-xl font-bold text-background gradient-gold"
      >
        العودة للرئيسية
      </button>
    </div>
  );
}
