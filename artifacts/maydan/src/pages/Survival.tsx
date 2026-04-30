import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { CATEGORIES, getCategoryById, Question } from "@/lib/questions";
import { fetchGameQuestions } from "@/lib/questionService";
import QuestionImage from "@/components/QuestionImage";
import CategoryCard from "@/components/CategoryCard";
import { recordSurvivalGame, recordCategoryAnswers, getSurvivalRank, getAvailablePowerCards, useSkipCard, useTimeCard, getOrCreateUser, addLeaderboardEntry } from "@/lib/storage";
import { insertScore, updateUserStats } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { playSound } from "@/lib/sound";
import AchievementPopup from "@/components/AchievementPopup";
import FloatingReward from "@/components/FloatingReward";
import { awardGameRewards, XP_REWARDS } from "@/lib/gamification";

const XP_PER_CORRECT = XP_REWARDS.correct_answer;

const LIVES_START = 3;
const BASE_TIME = 30;
const TIME_DECREMENT = 5;
const SPEED_EVERY = 5;
const MIN_TIME = 10;

type Phase = "select" | "playing" | "gameover";

function getTimerForScore(score: number): number {
  const reductions = Math.floor(score / SPEED_EVERY);
  return Math.max(MIN_TIME, BASE_TIME - reductions * TIME_DECREMENT);
}


export default function Survival() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, refreshUser } = useAuth();
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedCategory, setSelectedCategory] = useState<string>("mix");

  // Game state
  const [lives, setLives] = useState(LIVES_START);
  const [score, setScore] = useState(0);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [usedIds, setUsedIds] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(BASE_TIME);
  const [maxTime, setMaxTime] = useState(BASE_TIME);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, number>>({});
  const [totalAnswers, setTotalAnswers] = useState<Record<string, number>>({});
  const [skipAvail, setSkipAvail] = useState(0);
  const [timeAvail, setTimeAvail] = useState(0);
  const [powerUsed, setPowerUsed] = useState<{ skip: boolean; time: boolean }>({ skip: false, time: false });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionPoolRef = useRef<Question[]>([]);
  const [showReward, setShowReward] = useState<{ xp: number; coins: number } | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [perAnswerXP, setPerAnswerXP] = useState(false);
  const [rewardSummary, setRewardSummary] = useState<{ xp: number; coins: number; achievements: number } | null>(null);

  function loadPowerCards() {
    const cards = getAvailablePowerCards();
    setSkipAvail(cards.skip === Infinity ? 99 : cards.skip);
    setTimeAvail(cards.time === Infinity ? 99 : cards.time);
  }

  // Guarantee clean visual state on every question change (sync, before paint)
  useLayoutEffect(() => {
    console.log('[Survival] Question changed, resetting selection', { qid: currentQ?.id });
    setSelectedOption(null);
    setShowResult(false);
  }, [currentQ?.id]);

  async function startGame() {
    const pool = await fetchGameQuestions(selectedCategory);
    if (!pool.length) return;
    questionPoolRef.current = pool;
    const first = pool[0];
    const t = BASE_TIME;
    setLives(LIVES_START);
    setScore(0);
    setUsedIds(new Set([first.id]));
    setCurrentQ(first);
    setTimeLeft(t);
    setMaxTime(t);
    setSelectedOption(null);
    setShowResult(false);
    setCorrectAnswers({});
    setTotalAnswers({});
    setPowerUsed({ skip: false, time: false });
    loadPowerCards();
    setPhase("playing");
  }

  // Timer effect
  useEffect(() => {
    if (phase !== "playing" || showResult || !currentQ) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeOut();
          return 0;
        }
        if (prev <= 5) playSound("tick");
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, showResult, currentQ?.id]);

  const handleTimeOut = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentQ) return;
    setShowResult(true);
    playSound("wrong");
    setTotalAnswers(prev => ({ ...prev, [currentQ.category]: (prev[currentQ.category] || 0) + 1 }));

    setLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setTimeout(() => endGame(score), 900);
      } else {
        setTimeout(() => nextQuestion(), 900);
      }
      return newLives;
    });
  }, [currentQ, score]);

  function handleAnswer(idx: number) {
    if (selectedOption !== null || showResult || !currentQ) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOption(idx);
    setShowResult(true);

    const isCorrect = idx === currentQ.correct;
    playSound(isCorrect ? "correct" : "wrong");
    const cat = currentQ.category;
    setTotalAnswers(prev => ({ ...prev, [cat]: (prev[cat] || 0) + 1 }));

    if (isCorrect) {
      const newScore = score + 1;
      setScore(newScore);
      setCorrectAnswers(prev => ({ ...prev, [cat]: (prev[cat] || 0) + 1 }));
      setPerAnswerXP(true);
      setTimeout(() => setPerAnswerXP(false), 900);
      setTimeout(() => nextQuestion(newScore), 900);
    } else {
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          setTimeout(() => endGame(score), 900);
        } else {
          setTimeout(() => nextQuestion(score), 900);
        }
        return newLives;
      });
    }
  }

  function nextQuestion(currentScore?: number) {
    const s = currentScore ?? score;
    const pool = questionPoolRef.current.filter(q => !usedIds.has(q.id));
    if (!pool.length) { endGame(s); return; }
    const next = pool[Math.floor(Math.random() * pool.length)];

    const newMax = getTimerForScore(s);
    setUsedIds(prev => new Set([...prev, next.id]));
    setCurrentQ(next);
    setTimeLeft(newMax);
    setMaxTime(newMax);
    setSelectedOption(null);
    setShowResult(false);
    setPowerUsed({ skip: false, time: false });
  }

  function endGame(finalScore: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    // Record stats
    recordSurvivalGame(finalScore);
    Object.keys(totalAnswers).forEach(cat => {
      recordCategoryAnswers(cat, correctAnswers[cat] || 0, totalAnswers[cat]);
    });
    // Record to local leaderboard
    const u = getOrCreateUser();
    if (u.displayName) {
      addLeaderboardEntry({ name: u.displayName, score: finalScore, total: 0, category: selectedCategory, type: "survival" });
    }
    // Sync to Supabase only for authenticated users (not guests)
    const supName = dbUser?.username ?? u.displayName;
    if (supName && !isGuest) {
      insertScore({ user_id: dbUser?.id ?? null, username: supName, category: selectedCategory, score: finalScore, game_mode: "survival" });
      if (dbUser?.id) {
        updateUserStats(dbUser.id, { total_points: finalScore * 10 });
        // Award XP and coins
        const xpGain = finalScore >= 10 ? XP_REWARDS.win_survival_10 : Math.max(5, finalScore * 2);
        const survivalWin = finalScore >= 15 ? 1 : 0;
        awardGameRewards({
          userId: dbUser.id,
          xp: xpGain,
          coins: survivalWin ? 25 : 0,
          currentXP: dbUser.xp ?? 0,
          currentCoins: dbUser.coins ?? 0,
          currentLevel: dbUser.level ?? 1,
          currentAchievements: dbUser.achievements,
          currentSeasonPoints: dbUser.season_points ?? 0,
          progressUpdates: {
            total_games:       1,
            total_correct:     finalScore,
            survival_wins:     survivalWin,
            categories_played: selectedCategory,
          },
        }).then(result => {
          setShowReward({ xp: result.xpGained, coins: result.coinsGained });
          setRewardSummary({ xp: result.xpGained, coins: result.coinsGained, achievements: result.newlyUnlocked.length });
          if (result.newlyUnlocked.length > 0) setNewAchievements(result.newlyUnlocked);
          refreshUser();
        }).catch(() => {});
      }
    }
    setScore(finalScore);
    setPhase("gameover");
  }

  function handleSkip() {
    if (powerUsed.skip || skipAvail <= 0 || !currentQ) return;
    if (!useSkipCard()) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setPowerUsed(prev => ({ ...prev, skip: true }));
    setSkipAvail(prev => prev - 1);
    nextQuestion(score);
  }

  function handleAddTime() {
    if (powerUsed.time || timeAvail <= 0) return;
    if (!useTimeCard()) return;
    setPowerUsed(prev => ({ ...prev, time: true }));
    setTimeAvail(prev => prev - 1);
    setTimeLeft(prev => Math.min(prev + 15, maxTime + 15));
  }

  const user = getOrCreateUser();
  const rank = getSurvivalRank(score);
  const timerPct = maxTime > 0 ? (timeLeft / maxTime) * 100 : 0;
  const isTimerDanger = timeLeft <= 5;

  // ── CATEGORY SELECT ──
  if (phase === "select") {
    const selectableCats = [
      { id: "mix", name: "مزيج كل الفئات", icon: "🎲", gradient: "from-purple-600 to-pink-500", gFrom: "#9333ea", gTo: "#ec4899" },
      ...CATEGORIES.filter(c => !c.isPremium).map(c => ({ id: c.id, name: c.name, icon: c.icon, gradient: c.gradient, gFrom: c.gradientFrom, gTo: c.gradientTo }))
    ];

    return (
      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="p-4 flex items-center gap-3 border-b border-border/30">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
          <h1 className="text-lg font-bold">وضع البقاء 🏃</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="rp-narrow">
            {/* Rules */}
            <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4 mb-4 text-sm space-y-1.5">
              <p className="font-bold text-red-400 mb-2">⚔️ قواعد وضع البقاء</p>
              <p className="text-muted-foreground">❤️ لديك 3 أرواح — الإجابة الخاطئة تُفقدك روحاً</p>
              <p className="text-muted-foreground">⏱️ الوقت يقل كل 5 إجابات صحيحة (30←25←20←15)</p>
              <p className="text-muted-foreground">🃏 لديك بطاقتا قوة: تخطي ووقت إضافي</p>
            </div>

            <p className="text-xs text-muted-foreground mb-3 text-center font-semibold">اختر الفئة</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {selectableCats.map(cat => (
                <CategoryCard
                  key={cat.id}
                  cat={cat as any}
                  isSelected={selectedCategory === cat.id}
                  questionCount={cat.id === "mix" ? 225 : 15}
                  onClick={() => setSelectedCategory(cat.id)}
                  size="small"
                />
              ))}
            </div>

            <button
              onClick={startGame}
              className="w-full h-14 mt-5 rounded-xl text-white font-black text-lg transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
            >
              🏃 ابدأ البقاء
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME OVER ──
  if (phase === "gameover") {
    const shareText = `🏃 وضع البقاء في ميدان!\nوصلت إلى ${score} سؤالاً صحيحاً!\nرتبتي: ${rank.icon} ${rank.title}\nأفضل نتيجتي: ${user.stats.survivalBest}\nهل تستطيع التغلب عليّ؟\n${window.location.origin}`;

    return (
      <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6">
        {showReward && (
          <FloatingReward xp={showReward.xp} coins={showReward.coins} onDone={() => setShowReward(null)} />
        )}
        {newAchievements.length > 0 && (
          <AchievementPopup unlockedIds={newAchievements} onDone={() => setNewAchievements([])} />
        )}
        <div className="w-full max-w-sm text-center fade-in-up space-y-5">
          <div className="text-7xl animate-bounce">{rank.icon}</div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">رتبتك</p>
            <p className="text-3xl font-black" style={{ color: rank.color }}>{rank.title}</p>
          </div>

          {/* Reward summary card */}
          {!isGuest && (
            <div className="rounded-2xl p-4 border border-yellow-500/20 text-right"
              style={{ background: "linear-gradient(135deg,rgba(217,119,6,0.1),rgba(139,92,246,0.1))" }}>
              <p className="text-xs font-bold text-yellow-400 mb-3 text-center">🎁 مكافآت هذه الجولة</p>
              {rewardSummary ? (
                <div className="flex justify-around">
                  <div className="text-center">
                    <p className="text-xl font-black text-purple-400">+{rewardSummary.xp}</p>
                    <p className="text-[10px] text-muted-foreground">⭐ XP</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-yellow-400">+{rewardSummary.coins}</p>
                    <p className="text-[10px] text-muted-foreground">🪙 قرش</p>
                  </div>
                  {rewardSummary.achievements > 0 && (
                    <div className="text-center">
                      <p className="text-xl font-black text-green-400">+{rewardSummary.achievements}</p>
                      <p className="text-[10px] text-muted-foreground">🏅 إنجاز</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="w-5 h-5 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* Score big */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="text-6xl font-black text-primary">{score}</p>
            <p className="text-muted-foreground text-sm mt-1">إجابة صحيحة</p>
            {score > (user.stats.survivalBest - 1) && score > 0 && (
              <p className="text-xs text-yellow-400 mt-2 font-bold">🏆 رقم قياسي جديد!</p>
            )}
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <div>
                <p className="font-bold text-foreground">{user.stats.survivalBest}</p>
                <p className="text-xs text-muted-foreground">أفضل رقم</p>
              </div>
              <div>
                <p className="font-bold text-foreground">{user.stats.survivalGames}</p>
                <p className="text-xs text-muted-foreground">إجمالي الألعاب</p>
              </div>
            </div>
          </div>

          {/* Rank guide */}
          <div className="bg-card border border-border rounded-2xl p-4 text-right text-sm space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2">جدول الرتب</p>
            {[
              { range: "0–5", icon: "🥉", title: "مبتدئ", active: score <= 5 },
              { range: "6–15", icon: "⚔️", title: "محارب", active: score >= 6 && score <= 15 },
              { range: "16–30", icon: "🥇", title: "بطل", active: score >= 16 && score <= 30 },
              { range: "+31", icon: "👑", title: "أسطورة", active: score >= 31 },
            ].map(r => (
              <div key={r.title} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${r.active ? "bg-primary/10" : ""}`}>
                <span>{r.icon}</span>
                <span className={r.active ? "font-bold text-primary" : "text-muted-foreground"}>{r.title}</span>
                <span className="mr-auto text-xs text-muted-foreground">{r.range}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
            className="w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2"
            style={{ backgroundColor: "#25D366" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            مشاركة النتيجة
          </button>
          <div className="flex gap-3">
            <button onClick={startGame} className="flex-1 h-12 rounded-xl font-bold text-white" style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)" }}>
              🔄 العب مرة أخرى
            </button>
            <button onClick={() => navigate("/")} className="flex-1 h-12 rounded-xl border border-border text-foreground font-bold bg-card hover:bg-card/80 transition-colors">
              🏠 الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING ──
  if (!currentQ) return null;
  const category = getCategoryById(currentQ.category);

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Per-answer XP pop */}
      {perAnswerXP && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-bounce">
          <div className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black text-white border border-purple-500/40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)", boxShadow: "0 4px 20px rgba(124,58,237,0.5)" }}>
            <span>⭐</span>
            <span>+{XP_PER_CORRECT} XP</span>
          </div>
        </div>
      )}
      <div className="rp-narrow flex flex-col flex-1 w-full">
      {/* Status bar */}
      <header className="p-4 border-b border-border/30 space-y-2">
        <div className="flex justify-between items-center">
          {/* Lives */}
          <div className="flex gap-1">
            {Array.from({ length: LIVES_START }).map((_, i) => (
              <span key={i} className={`text-xl transition-all ${i < lives ? "" : "opacity-20 grayscale"}`}>❤️</span>
            ))}
          </div>
          {/* Score */}
          <div className="text-center">
            <span className="text-2xl font-black text-primary">{score}</span>
            <p className="text-[10px] text-muted-foreground">إجابة صحيحة</p>
          </div>
          {/* Timer */}
          <span className={`text-2xl font-black tabular-nums ${isTimerDanger ? "timer-danger" : "text-primary"}`}>
            {timeLeft}s
          </span>
        </div>

        {/* Timer bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{
              width: `${timerPct}%`,
              background: isTimerDanger ? "hsl(0 70% 50%)" : `linear-gradient(90deg, ${category?.gradientFrom || "#d97706"}, ${category?.gradientTo || "#f59e0b"})`,
            }}
          />
        </div>

        {/* Speed indicator */}
        <div className="text-center text-xs text-muted-foreground">
          ⚡ وقت السؤال: <span className="text-primary font-bold">{maxTime}s</span>
          {score > 0 && score % SPEED_EVERY === 0 && maxTime < BASE_TIME && (
            <span className="text-red-400 mr-2 font-bold animate-pulse">— تسريع!</span>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4">
        <div key={currentQ.id} className="flex-1 flex flex-col justify-center">
          {/* Category + difficulty */}
          <div className="flex justify-center gap-2 mb-3">
            <span className="text-xs px-3 py-1 rounded-full" style={{ background: `${category?.gradientFrom}22`, color: category?.gradientFrom, border: `1px solid ${category?.gradientFrom}44` }}>
              {category?.icon} {category?.name}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${
              currentQ.difficulty === "easy" ? "bg-green-500/15 text-green-400" :
              currentQ.difficulty === "medium" ? "bg-yellow-500/15 text-yellow-400" :
              "bg-red-500/15 text-red-400"
            }`}>
              {currentQ.difficulty === "easy" ? "سهل" : currentQ.difficulty === "medium" ? "متوسط" : "صعب"}
            </span>
          </div>

          {/* Question */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4 text-center slide-in">
            {currentQ.image_url && (
              <QuestionImage url={currentQ.image_url} maxHeight={200} className="mb-3" />
            )}
            <p className="text-lg font-bold leading-relaxed">{currentQ.question}</p>
          </div>

          {/* Options */}
          <div key={`answers-${currentQ.id}`} className="grid grid-cols-1 gap-3 mb-4">
            {currentQ.options.map((option, idx) => {
              const baseCls = "option-btn w-full p-4 rounded-xl text-right font-medium text-sm bg-card";
              let cls = baseCls;
              if (selectedOption !== null) {
                if (showResult) {
                  if (idx === currentQ.correct) cls = baseCls + " correct";
                  else if (idx === selectedOption) cls = baseCls + " wrong";
                } else if (idx === selectedOption) {
                  cls = baseCls + " selected";
                }
              } else if (showResult && idx === currentQ.correct) {
                cls = baseCls + " correct";
              }
              return (
                <button key={`${currentQ.id}-${idx}`} onClick={() => handleAnswer(idx)} disabled={showResult} className={cls}>
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                      {["أ","ب","ج","د"][idx]}
                    </span>
                    <span className="flex-1">{option}</span>
                    {showResult && idx === currentQ.correct && <span>✓</span>}
                    {showResult && idx === selectedOption && idx !== currentQ.correct && <span>✗</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* POWER CARDS */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleSkip}
              disabled={powerUsed.skip || skipAvail <= 0 || showResult}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                powerUsed.skip || skipAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                  : "border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
              }`}
            >
              <span>🔄</span>
              <span>تخطي</span>
              {skipAvail <= 2 && <span className="text-xs opacity-70">({skipAvail})</span>}
            </button>
            <button
              onClick={handleAddTime}
              disabled={powerUsed.time || timeAvail <= 0 || showResult}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                powerUsed.time || timeAvail <= 0
                  ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
              }`}
            >
              <span>⏱️</span>
              <span>+15 ثانية</span>
              {timeAvail <= 2 && <span className="text-xs opacity-70">({timeAvail})</span>}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
