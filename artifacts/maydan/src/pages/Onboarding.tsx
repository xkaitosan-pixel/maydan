import { useState } from "react";
import { useLocation } from "wouter";
import { markOnboardingComplete } from "@/lib/storage";

const SLIDES = [
  {
    icon: "⚔️",
    bg: "from-yellow-600/30 to-amber-500/20",
    border: "#d97706",
    title: "مرحباً في ميدان",
    subtitle: "ساحة المعرفة العربية",
    desc: "اختبر معلوماتك في 15 فئة متنوعة من الثقافة الإسلامية إلى الرياضة والترفيه",
    dots: ["🕌", "⚽", "🎬", "🧠", "🌍"],
  },
  {
    icon: "👥",
    bg: "from-purple-600/30 to-violet-500/20",
    border: "#7c3aed",
    title: "تحدَّ أصدقاءك",
    subtitle: "أوضاع لعب متعددة",
    desc: "العب ١ ضد ١ عبر واتساب، أو أنشئ غرفة لـ 8 لاعبين، أو نظّم بطولة إقصائية كاملة",
    dots: ["⚔️", "👥", "🏆", "🎮", "🔥"],
  },
  {
    icon: "👑",
    bg: "from-yellow-500/30 to-orange-400/20",
    border: "#eab308",
    title: "من يسيطر على الميدان؟",
    subtitle: "تنافس وتصدّر",
    desc: "اجمع النقاط، طوّر ستريكك اليومي، وتسلّق لوحة المتصدرين لتُلقَّب بـ «أسطورة»",
    dots: ["👑", "🔥", "📊", "🥇", "⚡"],
    isFinal: true,
  },
];

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState(0);
  const [exiting, setExiting] = useState(false);

  function goNext() {
    if (slide < SLIDES.length - 1) {
      setExiting(true);
      setTimeout(() => { setSlide(s => s + 1); setExiting(false); }, 200);
    } else {
      finish();
    }
  }

  function finish() {
    markOnboardingComplete();
    navigate("/");
  }

  const s = SLIDES[slide];

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-br ${s.bg} transition-all duration-300`}
      style={{ background: `linear-gradient(160deg, hsl(220 20% 8%), hsl(220 20% 12%))` }}>

      {/* Skip */}
      <div className="flex justify-between items-center p-4">
        <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border/50">
          تخطي
        </button>
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: i === slide ? 24 : 8, backgroundColor: i === slide ? s.border : "hsl(var(--border))" }} />
          ))}
        </div>
        <div className="w-14" />
      </div>

      {/* Content */}
      <div className={`flex-1 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-200 ${exiting ? "opacity-0" : "opacity-100"}`}>
        {/* Icon ring */}
        <div className="relative mb-8">
          <div className="w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-0"
            style={{ background: `linear-gradient(135deg, ${s.border}30, ${s.border}50)`, border: `2px solid ${s.border}60` }}>
            <span className="text-6xl">{s.icon}</span>
          </div>
          {/* Orbiting dots */}
          {s.dots.map((dot, i) => (
            <span
              key={i}
              className="absolute text-lg"
              style={{
                top: "50%",
                left: "50%",
                transform: `rotate(${i * 72}deg) translateY(-80px) rotate(-${i * 72}deg)`,
                marginTop: "-12px",
                marginLeft: "-12px",
              }}
            >{dot}</span>
          ))}
        </div>

        <p className="text-sm font-semibold mb-2" style={{ color: s.border }}>{s.subtitle}</p>
        <h1 className="text-3xl font-black text-foreground mb-4">{s.title}</h1>
        <p className="text-muted-foreground text-base leading-relaxed max-w-xs">{s.desc}</p>
      </div>

      {/* Bottom */}
      <div className="p-6 space-y-3">
        <button
          onClick={goNext}
          className="w-full h-14 rounded-2xl text-white font-black text-lg transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: `linear-gradient(135deg, ${s.border}, ${s.border}cc)` }}
        >
          {s.isFinal ? "🚀 ابدأ الآن" : "التالي →"}
        </button>
        {slide < SLIDES.length - 1 && (
          <button onClick={finish} className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1">
            أو تخطَّ الشرح
          </button>
        )}
      </div>
    </div>
  );
}
