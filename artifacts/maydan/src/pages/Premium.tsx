import { useState } from "react";
import { useLocation } from "wouter";
import { getOrCreateUser, activatePremium, deactivatePremium } from "@/lib/storage";
import { useAuth } from "@/lib/AuthContext";
import { setPremiumStatus } from "@/lib/db";

const BENEFITS = [
  { icon: "⚔️", text: "تحديات غير محدودة يومياً" },
  { icon: "🏆", text: "جميع الفئات الـ 15 مفتوحة" },
  { icon: "🃏", text: "بطاقات قوة غير محدودة" },
  { icon: "🚫", text: "بدون قيود أو إعلانات" },
  { icon: "📊", text: "إحصائيات متقدمة وتحليل أدائك" },
  { icon: "👑", text: "شارة برو على ملفك الشخصي" },
  { icon: "🎁", text: "مكافآت حصرية وصندوق يومي مُضاعف" },
];

const FREE_LIMITS = [
  { icon: "⚔️", text: "5 تحديات يومياً فقط" },
  { icon: "🔒", text: "فئة تحدي الأساطير مقفلة" },
  { icon: "🃏", text: "2 بطاقة قوة يومياً" },
  { icon: "📊", text: "إحصائيات أساسية" },
];

export default function Premium() {
  const [, navigate] = useLocation();
  const { dbUser, setDbUser } = useAuth();
  const user = getOrCreateUser();
  const [activated, setActivated] = useState(dbUser?.is_premium ?? user.isPremium);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubscribe() {
    activatePremium(); // local
    setActivated(true);
    setShowConfirm(true);
    setTimeout(() => setShowConfirm(false), 3000);
    if (dbUser?.id) {
      const updated = await setPremiumStatus(dbUser.id, true);
      if (updated) setDbUser(updated);
    }
  }

  async function handleDeactivate() {
    deactivatePremium(); // local
    setActivated(false);
    if (dbUser?.id) {
      const updated = await setPremiumStatus(dbUser.id, false);
      if (updated) setDbUser(updated);
    }
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate(-1 as any)} className="text-muted-foreground hover:text-foreground text-xl">←</button>
        <h1 className="text-lg font-bold">ميدان برو 👑</h1>
        {activated && (
          <span className="mr-auto text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2.5 py-1 rounded-full font-bold">
            مفعّل ✓
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-8">
        {/* Hero */}
        <div className="text-center py-4">
          <div className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center gold-glow"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
            <span className="text-5xl">👑</span>
          </div>
          <h2 className="text-3xl font-black text-primary">ميدان برو</h2>
          <p className="text-muted-foreground text-sm mt-1">الإصدار الكامل بلا قيود</p>
        </div>

        {/* Free trial banner */}
        {!activated && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center fade-in-up">
            <p className="text-green-400 font-black text-lg">🎁 جرّب 3 أيام مجاناً!</p>
            <p className="text-sm text-muted-foreground mt-1">لا حاجة لبطاقة ائتمان — فعّل الآن</p>
          </div>
        )}

        {/* Price card */}
        {!activated && (
          <div className="bg-card border border-primary/30 rounded-2xl p-5 text-center"
            style={{ background: "linear-gradient(135deg,hsl(220 20% 12%),hsl(220 20% 15%))" }}>
            <p className="text-muted-foreground text-sm mb-2">الاشتراك الشهري</p>
            <div className="flex items-baseline justify-center gap-1 mb-1">
              <span className="text-5xl font-black text-primary">19</span>
              <span className="text-xl text-primary font-bold">ريال</span>
            </div>
            <p className="text-xs text-muted-foreground">/ شهر — يتجدد تلقائياً</p>
            <div className="mt-3 flex items-center justify-center gap-1 text-xs text-green-400">
              <span>✓</span>
              <span>أول 3 أيام مجاناً</span>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="font-bold mb-3 text-sm">✨ مزايا برو</p>
          <div className="space-y-3">
            {BENEFITS.map((b) => (
              <div key={b.text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-base">{b.icon}</span>
                </div>
                <span className="text-sm text-foreground">{b.text}</span>
                <span className="mr-auto text-green-400 text-sm font-bold">✅</span>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="font-bold mb-3 text-sm text-muted-foreground">النسخة المجانية تحتوي على:</p>
          <div className="space-y-2.5">
            {FREE_LIMITS.map((f) => (
              <div key={f.text} className="flex items-center gap-3 opacity-60">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-base">{f.icon}</span>
                </div>
                <span className="text-sm text-muted-foreground">{f.text}</span>
                <span className="mr-auto text-red-400 text-sm">⛔</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        {activated ? (
          <div className="space-y-3 fade-in-up">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5 text-center">
              <div className="text-5xl mb-3 animate-bounce">👑</div>
              <p className="text-xl font-black text-yellow-400">أنت لاعب برو!</p>
              <p className="text-sm text-muted-foreground mt-1">جميع المميزات مفعّلة لحسابك</p>
            </div>
            <button onClick={() => navigate("/")} className="w-full h-14 rounded-xl font-black text-lg gradient-gold text-background hover:opacity-90 transition-opacity">
              🚀 العب الآن
            </button>
            <button onClick={handleDeactivate} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
              إلغاء الاشتراك
            </button>
          </div>
        ) : (
          <div className="space-y-3 fade-in-up">
            {showConfirm && (
              <div className="bg-green-500/15 border border-green-500/30 rounded-xl p-3 text-center text-green-400 text-sm font-bold fade-in-up">
                🎉 تم تفعيل ميدان برو بنجاح!
              </div>
            )}
            <button
              onClick={handleSubscribe}
              className="w-full h-14 rounded-2xl text-background font-black text-lg gold-glow hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b,#eab308)" }}
            >
              👑 اشترك الآن — 19 ريال/شهر
            </button>
            <p className="text-center text-xs text-muted-foreground">
              أول 3 أيام مجاناً · يمكن الإلغاء في أي وقت
            </p>
            <button onClick={() => navigate("/")} className="w-full h-11 rounded-xl border border-border text-foreground font-bold bg-card text-sm hover:bg-card/80 transition-colors">
              ربما لاحقاً
            </button>
          </div>
        )}

        {/* Trust badges */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: "🔒", label: "آمن 100%" },
            { icon: "↩️", label: "إلغاء سهل" },
            { icon: "⚡", label: "فوري" },
          ].map(b => (
            <div key={b.label} className="bg-card border border-border rounded-xl p-3">
              <span className="text-2xl">{b.icon}</span>
              <p className="text-xs text-muted-foreground mt-1">{b.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
