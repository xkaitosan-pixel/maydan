import { useLocation } from "wouter";
import { ArrowRight, Mail, Globe, MessageCircle } from "lucide-react";

const APP_VERSION = "1.0.0";

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  { icon: "⚔️", title: "تحدّي الأصدقاء",   desc: "أنشئ تحدياً وأرسل الرابط — يلعب الجميع بنفس الأسئلة." },
  { icon: "🏃", title: "وضع البقاء",        desc: "كم سؤالاً ستجاوب صحيحاً قبل أن تخسر؟" },
  { icon: "🏆", title: "الوضع المصنّف",     desc: "تنافس على لقب أفضل لاعب في الموسم." },
  { icon: "📅", title: "تحدي اليوم",        desc: "١٠ أسئلة جديدة كل يوم لجميع اللاعبين." },
  { icon: "👥", title: "غرفة الأصدقاء",     desc: "العبوا معاً في نفس الجهاز أو عن بُعد." },
  { icon: "📊", title: "إحصائيات وإنجازات", desc: "تابع تقدّمك في كل فئة واكسب شارات." },
];

export default function About() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen gradient-hero" dir="rtl">
      <div className="rp-narrow">
        <header className="p-4 flex items-center gap-3 border-b border-border/30 sticky top-0 bg-background/95 backdrop-blur z-10">
          <button
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
            className="text-muted-foreground hover:text-foreground"
            aria-label="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">عن ميدان ℹ️</h1>
        </header>

        <div className="p-5 space-y-6 pb-24 text-foreground">
          {/* Hero */}
          <div className="text-center space-y-3 pt-2">
            <div className="gold-glow mx-auto w-fit rounded-3xl">
              <img src="/logo.png" alt="ميدان" className="app-logo" style={{ width: 96, height: "auto" }} />
            </div>
            <h2 className="text-3xl font-black text-primary">ميدان</h2>
            <p className="text-secondary font-semibold text-sm">منصة تحديات المعرفة العربية</p>
            <p className="text-muted-foreground text-sm leading-7 max-w-xs mx-auto">
              لعبة أسئلة عربية تجمع الأصدقاء، تختبر معلوماتهم في ١٥ فئة،
              وتحوّل وقت الفراغ إلى تحدّي ممتع.
            </p>
          </div>

          {/* Features */}
          <section className="space-y-3">
            <h3 className="font-bold text-sm text-foreground">المميزات</h3>
            <div className="space-y-2">
              {FEATURES.map(f => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-border/40 bg-card p-3 flex items-start gap-3"
                >
                  <span className="text-2xl shrink-0 leading-none mt-0.5">{f.icon}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground leading-6">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Contact */}
          <section className="space-y-3">
            <h3 className="font-bold text-sm text-foreground">تواصل معنا</h3>
            <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-2">
              <a
                href="mailto:support@maydanapp.com"
                className="flex items-center gap-3 p-2.5 rounded-xl border border-border/30 hover:border-primary/40 transition-colors text-sm"
              >
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 font-bold">البريد الإلكتروني</span>
                <span className="text-xs text-muted-foreground" dir="ltr">support@maydanapp.com</span>
              </a>
              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border/30 opacity-60 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 font-bold">الموقع</span>
                <span className="text-xs text-muted-foreground">قريباً</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border/30 opacity-60 text-sm">
                <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 font-bold">حساباتنا الاجتماعية</span>
                <span className="text-xs text-muted-foreground">قريباً</span>
              </div>
            </div>
          </section>

          {/* Legal links */}
          <section className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate("/terms")}
              className="rounded-xl border border-border/40 bg-card py-3 text-sm font-bold hover:border-primary/40 transition-colors"
            >
              📜 شروط الاستخدام
            </button>
            <button
              onClick={() => navigate("/privacy")}
              className="rounded-xl border border-border/40 bg-card py-3 text-sm font-bold hover:border-primary/40 transition-colors"
            >
              🔒 سياسة الخصوصية
            </button>
          </section>

          {/* Version */}
          <p className="text-center text-xs text-muted-foreground pt-2">
            الإصدار {APP_VERSION} · © ٢٠٢٦ ميدان
          </p>
        </div>
      </div>
    </div>
  );
}
