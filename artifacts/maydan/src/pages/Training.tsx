import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { CATEGORIES, getQuestionsByCategory, type Question } from "@/lib/questions";
import { getCategoryLevel, engagementFrom } from "@/lib/engagement";
import { useAuth } from "@/lib/AuthContext";
import { playSound } from "@/lib/sound";

type Difficulty = "all" | "easy" | "medium" | "hard";

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "all",    label: "الكل" },
  { id: "easy",   label: "سهل" },
  { id: "medium", label: "متوسط" },
  { id: "hard",   label: "صعب" },
];

// Optional explanation field — questions may not carry one. We never fabricate a
// reason; the "لأن" line only renders when an explanation actually exists.
type TrainingQuestion = Question & { explanation?: string };

export default function Training() {
  const [, navigate] = useLocation();
  const { dbUser } = useAuth();

  const [phase, setPhase] = useState<"select" | "play">("select");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("all");
  const [pool, setPool] = useState<TrainingQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [seen, setSeen] = useState(0);
  const [right, setRight] = useState(0);

  const engagement = useMemo(
    () => (dbUser ? engagementFrom(dbUser.achievements) : null),
    [dbUser],
  );

  function start(catId: string) {
    let qs = getQuestionsByCategory(catId) as TrainingQuestion[];
    if (difficulty !== "all") qs = qs.filter(q => q.difficulty === difficulty);
    qs = [...qs].sort(() => Math.random() - 0.5);
    if (qs.length === 0) return;
    setCategoryId(catId);
    setPool(qs);
    setIdx(0);
    setSelected(null);
    setSeen(0);
    setRight(0);
    setPhase("play");
  }

  function choose(i: number) {
    if (selected !== null) return;
    const q = pool[idx];
    setSelected(i);
    setSeen(s => s + 1);
    if (i === q.correct) {
      setRight(r => r + 1);
      try { playSound("correct"); } catch { /* noop */ }
    } else {
      try { playSound("wrong"); } catch { /* noop */ }
    }
  }

  function next() {
    if (idx + 1 >= pool.length) {
      // Loop back through a reshuffled pool — training never "ends".
      setPool(p => [...p].sort(() => Math.random() - 0.5));
      setIdx(0);
    } else {
      setIdx(i => i + 1);
    }
    setSelected(null);
  }

  // ── SELECT SCREEN ──────────────────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div className="min-h-screen gradient-hero star-bg px-4 py-6 pb-24" dir="rtl">
        <div className="mx-auto max-w-2xl">
          <button onClick={() => navigate("/")} className="mb-4 text-sm text-muted-foreground hover:text-foreground">
            ← الرئيسية
          </button>

          <div className="mb-6 text-center">
            <div className="mb-2 text-5xl">🎓</div>
            <h1 className="text-2xl font-black text-foreground">وضع التدريب</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              تدرّب بلا وقت ولا ضغط — شاهد الإجابة الصحيحة وتعلّم. لا يُحتسب في إحصائياتك.
            </p>
          </div>

          {/* Difficulty filter */}
          <div className="mb-5 flex flex-wrap justify-center gap-2">
            {DIFFICULTIES.map(d => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                  difficulty === d.id ? "text-background" : "text-muted-foreground border border-border"
                }`}
                style={difficulty === d.id ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Category grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CATEGORIES.map(c => {
              const lvl = engagement ? getCategoryLevel(engagement, c.id) : null;
              return (
                <button
                  key={c.id}
                  onClick={() => start(c.id)}
                  className="relative rounded-2xl p-4 text-center press-shrink transition-all hover:-translate-y-1"
                  style={{
                    background: `linear-gradient(160deg, ${c.gradientFrom}, ${c.gradientTo})`,
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <span className="mb-1.5 block" style={{ fontSize: 36 }}>{c.icon}</span>
                  <p className="text-sm font-black text-white">{c.name}</p>
                  {lvl && (
                    <p className="mt-1 text-[10px] font-bold text-white/80">
                      {lvl.mastered ? "👑 إتقان" : `مستوى ${lvl.level}`}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── PLAY SCREEN ────────────────────────────────────────────────────────────
  const q = pool[idx];
  const cat = CATEGORIES.find(c => c.id === categoryId);
  const lvl = engagement && categoryId ? getCategoryLevel(engagement, categoryId) : null;

  return (
    <div className="min-h-screen gradient-hero star-bg px-4 py-6 pb-24" dir="rtl">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setPhase("select")} className="text-sm text-muted-foreground hover:text-foreground">
            ← الفئات
          </button>
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <span>{cat?.icon} {cat?.name}</span>
            {lvl && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">مستوى {lvl.level}</span>}
          </div>
        </div>

        <div className="mb-4 text-center text-xs text-muted-foreground">
          صحيحة: <span className="font-black text-green-400">{right}</span> / {seen}
        </div>

        {/* Question card */}
        <div className="mb-5 rounded-3xl border border-border bg-card p-6 text-center">
          {q.image_url && (
            <img src={q.image_url} alt="" className="mx-auto mb-4 max-h-44 rounded-xl object-contain" />
          )}
          <p className="text-lg font-black leading-relaxed text-foreground">{q.question}</p>
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.correct;
            const isPicked = i === selected;
            const reveal = selected !== null;
            let bg = "var(--card, rgba(255,255,255,0.05))";
            let border = "1px solid rgba(255,255,255,0.12)";
            if (reveal && isCorrect) { bg = "rgba(34,197,94,0.18)"; border = "1.5px solid #22c55e"; }
            else if (reveal && isPicked && !isCorrect) { bg = "rgba(239,68,68,0.18)"; border = "1.5px solid #ef4444"; }
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={reveal}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-right font-bold text-foreground transition-all press-shrink"
                style={{ background: bg, border }}
              >
                <span>{opt}</span>
                {reveal && isCorrect && <span>✅</span>}
                {reveal && isPicked && !isCorrect && <span>❌</span>}
              </button>
            );
          })}
        </div>

        {/* Reveal + explanation */}
        {selected !== null && (
          <div className="mt-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
            <p className="text-sm font-black text-green-400">
              الإجابة الصحيحة: {q.options[q.correct]}
            </p>
            {q.explanation && (
              <p className="mt-1.5 text-sm text-foreground">لأن: {q.explanation}</p>
            )}
            <button
              onClick={next}
              className="mt-4 w-full rounded-2xl py-3.5 font-black text-background"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
            >
              السؤال التالي ←
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
