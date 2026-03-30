import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export default function Auth() {
  const { signInWithGoogle, playAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogle() {
    try {
      setLoading(true);
      setError("");
      await signInWithGoogle();
      // Page will redirect to Google; no further action needed here
    } catch {
      setError("حدث خطأ. يرجى المحاولة مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col items-center justify-center p-6 text-center">
      {/* Logo */}
      <div className="w-28 h-28 rounded-full gradient-gold flex items-center justify-center gold-glow mb-5 mx-auto">
        <span className="text-6xl">⚔️</span>
      </div>
      <h1 className="text-5xl font-black text-primary">ميدان</h1>
      <p className="text-secondary font-semibold mt-1 mb-8 text-sm">ساحة المعرفة العربية</p>

      <div className="w-full max-w-xs space-y-3">
        {/* Google Login */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-bold text-white text-base transition-opacity hover:opacity-90 active:opacity-75 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #4285F4, #2563eb)" }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              جاري التحميل...
            </span>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              تسجيل الدخول بـ Google 🔵
            </>
          )}
        </button>

        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <div className="flex-1 h-px bg-border" />
          <span>أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Guest mode */}
        <button
          onClick={playAsGuest}
          className="w-full h-14 rounded-2xl border border-border text-foreground font-bold bg-card/80 text-base hover:bg-card transition-colors"
        >
          👤 العب كضيف
        </button>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
          الضيوف يحصلون على ميزات محدودة.
          سجّل الدخول للحصول على لوحة المتصدرين وحفظ التقدم عبر الأجهزة.
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2 mt-8">
        {["15 فئة ثقافية", "225 سؤال", "تحدي الأصدقاء", "لوحة المتصدرين"].map(f => (
          <span key={f} className="bg-card/60 border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">{f}</span>
        ))}
      </div>
    </div>
  );
}
