import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { COUNTRIES } from "@/lib/countryUtils";
import { CATEGORIES } from "@/lib/questions";
import { markOnboardingComplete } from "@/lib/storage";

const TOTAL_STEPS = 5;

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, refreshUser } = useAuth();

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<string>(dbUser?.country || "");
  const [favorites, setFavorites] = useState<string[]>(
    Array.isArray(dbUser?.favorite_categories) ? dbUser!.favorite_categories! : [],
  );
  const [tutSlide, setTutSlide] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);

  // Fire-and-forget save with hard timeout. Never blocks UI.
  function backgroundSave(label: string, payload: Record<string, unknown>) {
    if (!dbUser?.id || isGuest) return;
    const id = dbUser.id;
    console.log(`[onboarding] saving ${label}`, payload);
    const update = supabase.from("users").update(payload).eq("id", id);
    const timeout = new Promise<{ error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ error: new Error("save timeout (3s)") }),
        3000,
      ),
    );
    Promise.race([update, timeout])
      .then((res) => {
        const err = (res as { error?: unknown }).error;
        if (err) console.warn(`[onboarding] ${label} save failed:`, err);
        else {
          console.log(`[onboarding] ${label} saved`);
          refreshUser().catch((e) =>
            console.warn(`[onboarding] refresh after ${label} failed`, e),
          );
        }
      })
      .catch((e) => console.warn(`[onboarding] ${label} threw`, e));
  }

  // Step 5: trigger confetti when reached
  useEffect(() => {
    if (step !== 4) return;
    setConfettiOn(true);
    const t = setTimeout(() => setConfettiOn(false), 4000);
    return () => clearTimeout(t);
  }, [step]);

  function next() {
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  function saveCountryAndNext() {
    if (!country) return;
    backgroundSave("country", { country });
    next();
  }

  function saveFavoritesAndNext() {
    if (favorites.length !== 3) return;
    backgroundSave("favorite_categories", { favorite_categories: favorites });
    next();
  }

  function finish() {
    // Always set local guard first so navigating home never re-triggers onboarding
    markOnboardingComplete();
    backgroundSave("onboarding_completed", { onboarding_completed: true });
    navigate("/");
  }

  const playerName =
    dbUser?.display_name || dbUser?.username || "اللاعب";
  const avatarUrl =
    dbUser?.avatar_url ||
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(playerName)}&backgroundColor=9333ea`;
  const playerCountry = country || dbUser?.country || "";
  const playerFlag =
    COUNTRIES.find((c) => c.code === playerCountry)?.flag || "🌍";

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      dir="rtl"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 500px at 100% 100%, rgba(217,119,6,0.16), transparent 60%), linear-gradient(160deg, #0a0a14 0%, #11091e 50%, #0a0a14 100%)",
      }}
    >
      <ParticlesBg />

      {/* Top bar: progress dots */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-5">
        <button
          onClick={back}
          disabled={step === 0}
          className="text-xs text-white/50 hover:text-white/80 transition disabled:opacity-0 px-3 py-1.5 rounded-full border border-white/10"
        >
          ← السابق
        </button>
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === step ? 28 : 8,
                background:
                  i === step
                    ? "linear-gradient(90deg,#d97706,#fbbf24)"
                    : i < step
                    ? "rgba(217,119,6,0.5)"
                    : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>
        <div className="w-14" />
      </div>

      {/* Steps */}
      <div className="relative z-10 flex-1 flex flex-col">
        {step === 0 && <StepWelcome onStart={next} />}
        {step === 1 && (
          <StepCountry
            selected={country}
            onSelect={setCountry}
            onNext={saveCountryAndNext}
          />
        )}
        {step === 2 && (
          <StepCategories
            selected={favorites}
            onToggle={(id) => {
              setFavorites((prev) => {
                if (prev.includes(id)) return prev.filter((x) => x !== id);
                if (prev.length >= 3) return prev;
                return [...prev, id];
              });
            }}
            onNext={saveFavoritesAndNext}
          />
        )}
        {step === 3 && (
          <StepTutorial
            slide={tutSlide}
            setSlide={setTutSlide}
            onNext={next}
          />
        )}
        {step === 4 && (
          <StepReady
            playerName={playerName}
            avatarUrl={avatarUrl}
            flag={playerFlag}
            confetti={confettiOn}
            onEnter={finish}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Particles background ─────────────────── */
function ParticlesBg() {
  const stars = useMemo(
    () =>
      Array.from({ length: 32 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 6,
        duration: 4 + Math.random() * 6,
        opacity: 0.3 + Math.random() * 0.6,
      })),
    [],
  );
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: "white",
            opacity: s.opacity,
            boxShadow: "0 0 6px rgba(255,255,255,0.7)",
            animation: `mdyTwinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes mdyTwinkle {
          0%,100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.4); }
        }
        @keyframes mdyFloat {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes mdySpinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes mdyPulseRing {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes mdySlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes mdyConfettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────── Step 1: Welcome ─────────────────── */
function StepWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-10" style={{ animation: "mdyFloat 4s ease-in-out infinite" }}>
        {/* Pulse rings */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border-2"
            style={{
              borderColor: "rgba(217,119,6,0.45)",
              animation: `mdyPulseRing 2.6s ease-out ${i * 0.8}s infinite`,
            }}
          />
        ))}
        <div
          className="w-40 h-40 rounded-full flex items-center justify-center relative"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(124,58,237,0.55), rgba(217,119,6,0.35) 60%, rgba(0,0,0,0.4))",
            boxShadow:
              "0 0 60px rgba(124,58,237,0.45), inset 0 0 30px rgba(0,0,0,0.4)",
            border: "2px solid rgba(217,119,6,0.6)",
          }}
        >
          <span className="text-7xl">⚔️</span>
        </div>
      </div>

      <p
        className="text-base font-bold mb-2"
        style={{
          background: "linear-gradient(90deg,#fbbf24,#d97706)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        ساحة المعرفة العربية
      </p>
      <h1 className="text-4xl font-black text-white mb-4">أهلاً في ميدان!</h1>
      <p className="text-white/60 text-sm leading-relaxed max-w-xs mb-12">
        تنافس، تحدَّ أصدقاءك، واصعد لقمة لوحة المتصدرين
      </p>

      <button
        onClick={onStart}
        className="w-full max-w-sm h-14 rounded-2xl text-white font-black text-lg active:scale-[0.98] transition-all"
        style={{
          background: "linear-gradient(135deg,#d97706 0%,#7c3aed 100%)",
          boxShadow:
            "0 10px 30px rgba(124,58,237,0.4), 0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      >
        ابدأ رحلتك 🚀
      </button>
    </div>
  );
}

/* ─────────────────── Step 2: Country ─────────────────── */
function StepCountry({
  selected,
  onSelect,
  onNext,
}: {
  selected: string;
  onSelect: (c: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-5 pb-6">
      <div className="text-center pt-4 pb-5">
        <p className="text-xs font-bold text-amber-400/80 mb-1">الخطوة 2 من 5</p>
        <h2 className="text-2xl font-black text-white mb-1">من أي دولة أنت؟</h2>
        <p className="text-white/50 text-sm">اختر علم بلدك</p>
      </div>

      <div className="flex-1 grid grid-cols-4 gap-2.5 overflow-y-auto pb-4">
        {COUNTRIES.map((c) => {
          const active = selected === c.code;
          return (
            <button
              key={c.code}
              onClick={() => onSelect(c.code)}
              className="aspect-[3/4] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
              style={{
                background: active
                  ? "linear-gradient(135deg, rgba(217,119,6,0.25), rgba(124,58,237,0.22))"
                  : "rgba(255,255,255,0.04)",
                border: active
                  ? "2px solid #d97706"
                  : "1px solid rgba(255,255,255,0.08)",
                boxShadow: active
                  ? "0 0 24px rgba(217,119,6,0.45)"
                  : "none",
                transform: active ? "scale(1.04)" : "scale(1)",
              }}
            >
              <span className="text-3xl leading-none">{c.flag}</span>
              <span
                className="text-[10px] font-semibold leading-tight text-center px-1"
                style={{ color: active ? "#fbbf24" : "rgba(255,255,255,0.7)" }}
              >
                {c.name}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        disabled={!selected}
        className="w-full h-14 rounded-2xl text-white font-black text-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: selected
            ? "linear-gradient(135deg,#d97706 0%,#7c3aed 100%)"
            : "rgba(255,255,255,0.06)",
          boxShadow: selected ? "0 10px 30px rgba(124,58,237,0.35)" : "none",
        }}
      >
        التالي ←
      </button>
    </div>
  );
}

/* ─────────────────── Step 3: Favorite Categories ─────────────────── */
function StepCategories({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  const ready = selected.length === 3;
  return (
    <div className="flex-1 flex flex-col px-5 pb-6">
      <div className="text-center pt-4 pb-4">
        <p className="text-xs font-bold text-amber-400/80 mb-1">الخطوة 3 من 5</p>
        <h2 className="text-2xl font-black text-white mb-1">اختر 3 فئات تفضلها</h2>
        <p
          className="text-sm font-bold"
          style={{ color: ready ? "#22c55e" : "#fbbf24" }}
        >
          اخترت {selected.length}/3
        </p>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-2 overflow-y-auto pb-4">
        {CATEGORIES.map((cat) => {
          const active = selected.includes(cat.id);
          const disabled = !active && selected.length >= 3;
          return (
            <button
              key={cat.id}
              onClick={() => onToggle(cat.id)}
              disabled={disabled}
              className="relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 p-2"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${cat.gradientFrom}, ${cat.gradientTo})`
                  : "rgba(255,255,255,0.04)",
                border: active
                  ? "2px solid #d97706"
                  : "1px solid rgba(255,255,255,0.08)",
                boxShadow: active
                  ? "0 0 22px rgba(217,119,6,0.45)"
                  : "none",
                opacity: disabled ? 0.35 : 1,
                transform: active ? "scale(1.03)" : "scale(1)",
              }}
            >
              <span className="text-3xl leading-none">{cat.icon}</span>
              <span
                className="text-[11px] font-bold leading-tight text-center"
                style={{ color: active ? "#fff" : "rgba(255,255,255,0.75)" }}
              >
                {cat.name}
              </span>
              {active && (
                <span
                  className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ background: "#d97706", color: "#fff" }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        disabled={!ready}
        className="w-full h-14 rounded-2xl text-white font-black text-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: ready
            ? "linear-gradient(135deg,#d97706 0%,#7c3aed 100%)"
            : "rgba(255,255,255,0.06)",
          boxShadow: ready ? "0 10px 30px rgba(124,58,237,0.35)" : "none",
        }}
      >
        التالي ←
      </button>
    </div>
  );
}

/* ─────────────────── Step 4: Tutorial (swipeable) ─────────────────── */
const TUT_CARDS = [
  {
    icon: "⚔️",
    title: "تحدِّ أصدقاءك",
    desc: "أرسل تحدياً عبر واتساب وشاهد من يفوز",
    illustration: (
      <div className="flex items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 flex items-center justify-center text-2xl">
          😎
        </div>
        <div className="text-3xl text-amber-400">⚔️</div>
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600 to-amber-900 flex items-center justify-center text-2xl">
          😈
        </div>
      </div>
    ),
    grad: "from-purple-700 to-purple-950",
  },
  {
    icon: "🏆",
    title: "تصدَّر اللوحة",
    desc: "اصعد ترتيب لوحة المتصدرين بين الأفضل",
    illustration: (
      <div className="space-y-1.5 w-full max-w-[200px] mx-auto">
        {[
          { r: 1, c: "#fbbf24", w: 100 },
          { r: 2, c: "#a78bfa", w: 75 },
          { r: 3, c: "#d97706", w: 55 },
        ].map((row) => (
          <div key={row.r} className="flex items-center gap-2">
            <span className="text-xs font-black text-white w-4">{row.r}</span>
            <div
              className="h-3 rounded-full"
              style={{ width: `${row.w}%`, background: row.c }}
            />
          </div>
        ))}
      </div>
    ),
    grad: "from-amber-700 to-amber-950",
  },
  {
    icon: "🎁",
    title: "اكسب مكافآت",
    desc: "اجمع XP وعملات وفتح ميزات جديدة",
    illustration: (
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-3xl">⭐</span>
          <span className="text-xs font-black text-amber-400 mt-1">+100 XP</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-3xl">🪙</span>
          <span className="text-xs font-black text-amber-400 mt-1">+50</span>
        </div>
      </div>
    ),
    grad: "from-emerald-700 to-emerald-950",
  },
];

function StepTutorial({
  slide,
  setSlide,
  onNext,
}: {
  slide: number;
  setSlide: (n: number) => void;
  onNext: () => void;
}) {
  const startX = useRef(0);
  const card = TUT_CARDS[slide];
  const isLast = slide === TUT_CARDS.length - 1;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) < 40) return;
    // RTL: swipe right (positive dx) = previous, swipe left = next
    if (dx < 0 && slide < TUT_CARDS.length - 1) setSlide(slide + 1);
    if (dx > 0 && slide > 0) setSlide(slide - 1);
  }

  return (
    <div className="flex-1 flex flex-col px-5 pb-6">
      <div className="text-center pt-4 pb-4">
        <p className="text-xs font-bold text-amber-400/80 mb-1">الخطوة 4 من 5</p>
        <h2 className="text-2xl font-black text-white">كيف نلعب؟</h2>
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          key={slide}
          className={`w-full max-w-sm rounded-3xl p-6 text-center bg-gradient-to-br ${card.grad}`}
          style={{
            border: "1px solid rgba(217,119,6,0.35)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
            animation: "mdySlideIn 0.35s ease-out",
          }}
        >
          <div className="text-6xl mb-4">{card.icon}</div>
          <h3 className="text-xl font-black text-white mb-2">{card.title}</h3>
          <p className="text-sm text-white/75 mb-6">{card.desc}</p>
          <div className="bg-black/30 rounded-2xl p-4 min-h-[100px] flex items-center justify-center">
            {card.illustration}
          </div>
        </div>

        {/* Slide dots */}
        <div className="flex gap-2 mt-6">
          {TUT_CARDS.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === slide ? 20 : 8,
                background:
                  i === slide ? "#d97706" : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => (isLast ? onNext() : setSlide(slide + 1))}
        className="w-full h-14 rounded-2xl text-white font-black text-lg active:scale-[0.98] transition-all"
        style={{
          background: "linear-gradient(135deg,#d97706 0%,#7c3aed 100%)",
          boxShadow: "0 10px 30px rgba(124,58,237,0.35)",
        }}
      >
        {isLast ? "فهمت! هيا نبدأ" : "التالي ←"}
      </button>
    </div>
  );
}

/* ─────────────────── Step 5: Ready (Confetti) ─────────────────── */
function StepReady({
  playerName,
  avatarUrl,
  flag,
  confetti,
  onEnter,
}: {
  playerName: string;
  avatarUrl: string;
  flag: string;
  confetti: boolean;
  onEnter: () => void;
}) {
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.5 + Math.random() * 2,
        color: ["#d97706", "#fbbf24", "#7c3aed", "#a78bfa", "#22c55e"][i % 5],
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
      })),
    [],
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center relative">
      {confetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {confettiPieces.map((p) => (
            <span
              key={p.id}
              className="absolute"
              style={{
                left: `${p.left}%`,
                top: -20,
                width: p.size,
                height: p.size * 0.4,
                background: p.color,
                transform: `rotate(${p.rotate}deg)`,
                animation: `mdyConfettiFall ${p.duration}s linear ${p.delay}s forwards`,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative mb-6" style={{ animation: "mdyFloat 4s ease-in-out infinite" }}>
        <div
          className="w-32 h-32 rounded-full overflow-hidden relative"
          style={{
            border: "3px solid #d97706",
            boxShadow: "0 0 40px rgba(217,119,6,0.6)",
          }}
        >
          <img
            src={avatarUrl}
            alt={playerName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <span
          className="absolute -bottom-1 -right-2 text-3xl bg-black/60 rounded-full w-11 h-11 flex items-center justify-center"
          style={{ border: "2px solid #d97706" }}
        >
          {flag}
        </span>
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-4xl">
          👑
        </span>
      </div>

      <p
        className="text-sm font-bold mb-1"
        style={{
          background: "linear-gradient(90deg,#fbbf24,#d97706)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        مرحباً يا بطل
      </p>
      <h2 className="text-3xl font-black text-white mb-1">{playerName}</h2>
      <p className="text-white/60 text-sm mb-2">
        {flag} جاهز للمنافسة
      </p>
      <h1 className="text-2xl font-black mb-10" style={{ color: "#fbbf24" }}>
        أنت جاهز للميدان! 👑
      </h1>

      <button
        onClick={onEnter}
        className="w-full max-w-sm h-16 rounded-2xl text-white font-black text-xl active:scale-[0.98] transition-all"
        style={{
          background: "linear-gradient(135deg,#d97706 0%,#7c3aed 100%)",
          boxShadow:
            "0 14px 40px rgba(124,58,237,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset",
        }}
      >
        ادخل الميدان ⚔️
      </button>
    </div>
  );
}
