import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { getCategoryById, Question } from "@/lib/questions";
import { fetchQuestionsByIds } from "@/lib/questionService";
import { getChallenge, recordWin, getOrCreateUser, addLeaderboardEntry, getSurvivalRank } from "@/lib/storage";
import { useAuth } from "@/lib/AuthContext";
import { insertScore, updateUserStats } from "@/lib/db";
import { Button } from "@/components/ui/button";
import AchievementPopup from "@/components/AchievementPopup";
import FloatingReward from "@/components/FloatingReward";
import { awardGameRewards, XP_REWARDS, COIN_REWARDS } from "@/lib/gamification";

const WA_ICON = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function Results() {
  const params = useParams<{ id: string; role: string }>();
  const [, navigate] = useLocation();
  const { dbUser, isGuest } = useAuth();
  const challengeId = params.id;
  const role = params.role as "creator" | "challenger";
  const [copied, setCopied] = useState(false);
  const [winRecorded, setWinRecorded] = useState(false);
  const [loadedQs, setLoadedQs] = useState<Question[]>([]);
  const [showReward, setShowReward] = useState<{ xp: number; coins: number } | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);

  const challenge = getChallenge(challengeId);
  const category = challenge ? getCategoryById(challenge.categoryId) : null;
  const user = getOrCreateUser();

  useEffect(() => {
    if (challenge) {
      fetchQuestionsByIds(challenge.questions).then(setLoadedQs);
    }
  }, [challengeId]);

  useEffect(() => {
    if (!challenge || winRecorded) return;
    if (challenge.status === "completed") {
      const cs = challenge.creatorScore;
      const chs = challenge.challengerScore ?? 0;
      const myWon = role === "creator" ? cs > chs : chs > cs;
      if (myWon) { recordWin(); }
      setWinRecorded(true);

      // Record to local leaderboard
      const myScore = role === "creator" ? cs : chs;
      const myName = role === "creator" ? challenge.creatorName : (challenge.challengerName ?? user.displayName);
      if (myName) {
        addLeaderboardEntry({ name: myName, score: myScore, total: challenge.questions.length, category: challenge.categoryId, type: "challenge" });
      }

      // Record to Supabase (authenticated users only)
      const supabaseName = dbUser?.username ?? myName;
      if (supabaseName && !isGuest) {
        insertScore({
          user_id: dbUser?.id ?? null,
          username: supabaseName,
          category: challenge.categoryId,
          score: myScore,
          game_mode: "challenge",
        });
        if (dbUser?.id) {
          updateUserStats(dbUser.id, {
            total_wins: myWon ? 1 : 0,
            total_losses: myWon ? 0 : 1,
            total_points: myScore * 10,
          });
          // Award XP and coins
          const xpGain    = myWon ? XP_REWARDS.win_1v1 : 10;
          const coinGain  = myWon ? COIN_REWARDS.win_1v1 : 0;
          awardGameRewards({
            userId: dbUser.id,
            xp: xpGain,
            coins: coinGain,
            currentXP: dbUser.xp ?? 0,
            currentCoins: dbUser.coins ?? 0,
            currentLevel: dbUser.level ?? 1,
            currentAchievements: dbUser.achievements,
            currentSeasonPoints: dbUser.season_points ?? 0,
            progressUpdates: {
              total_games:      1,
              total_correct:    myScore,
              consecutive_wins: myWon ? 1 : 0,
              categories_played: challenge.categoryId,
            },
          }).then(result => {
            setShowReward({ xp: result.xpGained, coins: result.coinsGained });
            if (result.newlyUnlocked.length > 0) setNewAchievements(result.newlyUnlocked);
          }).catch(() => {});
        }
      }
    }
  }, [challenge, role, winRecorded]);

  if (!challenge) { navigate("/"); return null; }

  const questionList = challenge.questions.map(id => loadedQs.find(q => q.id === id)!);
  const total = questionList.length;
  const creatorScore = challenge.creatorScore;
  const challengerScore = challenge.challengerScore;
  const isCompleted = challenge.status === "completed";

  const myScore = role === "creator" ? creatorScore : (challengerScore ?? 0);
  const opponentScore = role === "creator" ? (challengerScore ?? null) : creatorScore;
  const opponentName = role === "creator" ? (challenge.challengerName ?? "المنتظر") : challenge.creatorName;
  const myName = role === "creator" ? challenge.creatorName : (challenge.challengerName ?? "أنت");

  let winnerText = "";
  let isWinner = false;
  let isTie = false;
  if (isCompleted && opponentScore !== null) {
    if (myScore > opponentScore) { winnerText = "🎉 أنت الفائز!"; isWinner = true; }
    else if (myScore < opponentScore) { winnerText = "😔 خسرت هذه المرة"; }
    else { winnerText = "🤝 تعادل!"; isTie = true; }
  }

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}challenge/${challengeId}`;
  const pct = Math.round((myScore / total) * 100);
  const rank = getSurvivalRank(myScore);

  // Viral share texts
  function getViralShareText() {
    const catLabel = category ? `${category.icon} ${category.name}` : "ميدان";
    if (isCompleted) {
      return isWinner
        ? `🏆 فزت في تحدي ${catLabel}!\nنتيجتي: ${myScore}/${total} (${pct}%)\nرتبتي: ${rank.icon} ${rank.title}\nتحداني إذا تجرأ 😏\n${shareUrl}`
        : `⚔️ خضت تحدي ${catLabel} في ميدان!\nنتيجتي: ${myScore}/${total}\nهل تستطيع التغلب عليّ؟\n${shareUrl}`;
    }
    return `⚔️ تحداك ${challenge?.creatorName ?? ""} في ${catLabel}!\nنتيجته: ${creatorScore}/${total}\nهل تستطيع التغلب عليه؟\n${shareUrl}`;
  }

  function shareResult() {
    window.open(`https://wa.me/?text=${encodeURIComponent(getViralShareText())}`, "_blank");
  }

  function shareChallengeLink() {
    const catLabel = category ? `${category.icon} ${category.name}` : "ميدان";
    const text = `⚔️ تعال تحداني في ميدان — ${catLabel}!\nأنا جاهز، هل أنت جاهز؟ 💪\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {showReward && (
        <FloatingReward
          xp={showReward.xp}
          coins={showReward.coins}
          onDone={() => setShowReward(null)}
        />
      )}
      {newAchievements.length > 0 && (
        <AchievementPopup
          unlockedIds={newAchievements}
          onDone={() => setNewAchievements([])}
        />
      )}
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl">←</button>
        <div className="flex items-center gap-2">
          {category && <span className="text-xl">{category.icon}</span>}
          <h1 className="text-lg font-bold">{category?.name ?? "نتائج التحدي"}</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6">
        {/* Winner banner */}
        {isCompleted && (
          <div
            className="rounded-2xl p-5 text-center fade-in-up border"
            style={
              isWinner
                ? { background: `linear-gradient(135deg, ${category?.gradientFrom}cc, ${category?.gradientTo}cc)`, borderColor: `${category?.gradientFrom}44` }
                : isTie
                ? { background: "hsl(var(--secondary) / 0.2)", borderColor: "hsl(var(--secondary) / 0.3)" }
                : { background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }
            }
          >
            <p className={`text-2xl font-black ${isWinner ? "text-white" : "text-foreground"}`}>{winnerText}</p>
          </div>
        )}

        {/* Score comparison */}
        {isCompleted ? (
          <div className="bg-card border border-border rounded-2xl p-5 fade-in-up">
            <div className="grid grid-cols-3 gap-4 items-center text-center">
              <div>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 border-2"
                  style={{ background: `${category?.gradientFrom}22`, borderColor: category?.gradientFrom || "hsl(var(--primary))" }}>
                  <span className="text-xl font-black" style={{ color: category?.gradientFrom }}>{myScore}</span>
                </div>
                <p className="text-xs text-muted-foreground">{myName}</p>
                <p className="text-xs font-bold" style={{ color: category?.gradientFrom }}>{pct}%</p>
              </div>
              <div><p className="text-2xl font-black text-muted-foreground">VS</p></div>
              <div>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 border-2 ${(opponentScore ?? 0) > myScore ? "" : "border-border bg-muted"}`}
                  style={(opponentScore ?? 0) > myScore ? { background: `${category?.gradientFrom}22`, borderColor: category?.gradientFrom } : {}}>
                  <span className="text-xl font-black" style={(opponentScore ?? 0) > myScore ? { color: category?.gradientFrom } : { color: "hsl(var(--muted-foreground))" }}>{opponentScore}</span>
                </div>
                <p className="text-xs text-muted-foreground">{opponentName}</p>
                <p className="text-xs text-muted-foreground">{Math.round(((opponentScore ?? 0) / total) * 100)}%</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-5 text-center fade-in-up space-y-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto gold-glow"
              style={{ background: category ? `linear-gradient(135deg, ${category.gradientFrom}, ${category.gradientTo})` : "" }}>
              <span className="text-2xl font-black text-white">{creatorScore}</span>
            </div>
            <div>
              <p className="font-bold text-lg">نتيجتك: {creatorScore}/{total}</p>
              <p className="text-muted-foreground text-sm">شارك الرابط مع صديقك ليقبل التحدي!</p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                  style={{ background: category?.gradientFrom, animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">في انتظار المنافس...</p>
          </div>
        )}

        {/* ── VIRAL SHARE CARD ── */}
        <div className="rounded-2xl border overflow-hidden fade-in-up"
          style={{ background: `linear-gradient(135deg, ${category?.gradientFrom}18, ${category?.gradientTo}25)`, borderColor: `${category?.gradientFrom}40` }}>
          {/* Brand header */}
          <div className="px-4 pt-4 pb-2 flex items-center gap-2 border-b" style={{ borderColor: `${category?.gradientFrom}25` }}>
            <div className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center text-background font-black text-xs">م</div>
            <span className="font-black text-sm text-primary">ميدان</span>
            <span className="text-xs text-muted-foreground mr-auto">{category?.icon} {category?.name}</span>
          </div>

          {/* Card body */}
          <div className="p-4 text-center">
            <p className="text-4xl mb-2">{isWinner ? "🏆" : isTie ? "🤝" : rank.icon}</p>
            <p className="text-2xl font-black" style={{ color: category?.gradientFrom }}>{myName}</p>
            <div className="flex items-center justify-center gap-3 mt-3">
              <div className="text-center">
                <p className="text-3xl font-black text-foreground">{myScore}/{total}</p>
                <p className="text-xs text-muted-foreground">النتيجة</p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <p className="text-3xl font-black" style={{ color: category?.gradientFrom }}>{pct}%</p>
                <p className="text-xs text-muted-foreground">دقة</p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <p className="text-xl font-black">{rank.icon}</p>
                <p className="text-xs font-bold" style={{ color: rank.color }}>{rank.title}</p>
              </div>
            </div>
          </div>

          {/* Share buttons */}
          <div className="p-4 pt-0 grid grid-cols-2 gap-2">
            <button
              onClick={shareResult}
              className="h-11 rounded-xl text-white font-bold flex items-center justify-center gap-2 text-sm"
              style={{ backgroundColor: "#25D366" }}
            >
              {WA_ICON}
              شارك نتيجتك
            </button>
            <button
              onClick={shareChallengeLink}
              className="h-11 rounded-xl text-white font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${category?.gradientFrom || "#7c3aed"}, ${category?.gradientTo || "#8b5cf6"})` }}
            >
              ⚔️ تحدي صديق
            </button>
          </div>
        </div>

        {/* My score breakdown */}
        <div className="bg-card border border-border rounded-2xl p-5 fade-in-up">
          <div className="flex justify-between items-center mb-3">
            <p className="font-bold">نتيجتك التفصيلية</p>
            <span className={`text-sm font-bold px-2 py-1 rounded-full ${pct >= 70 ? "bg-green-500/20 text-green-400" : pct >= 40 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
              {myScore}/{total}
            </span>
          </div>
          {/* Circular progress */}
          <div className="flex justify-center mb-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full progress-ring" viewBox="0 0 36 36">
                <path className="stroke-muted fill-none stroke-[3]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="fill-none stroke-[3] transition-all duration-1000" strokeLinecap="round"
                  stroke={category?.gradientFrom || "hsl(45 85% 50%)"}
                  strokeDasharray={`${pct}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black" style={{ color: category?.gradientFrom }}>{pct}%</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {questionList.map((q, idx) => {
              const myAns = role === "creator" ? challenge.creatorAnswers[idx] : (challenge.challengerAnswers?.[idx] ?? null);
              const isCorrect = myAns === q?.correct;
              return (
                <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${isCorrect ? "bg-green-500/10" : myAns === null ? "bg-yellow-500/10" : "bg-red-500/10"}`}>
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? "bg-green-500 text-white" : myAns === null ? "bg-yellow-500 text-black" : "bg-red-500 text-white"}`}>
                    {isCorrect ? "✓" : myAns === null ? "⏱" : "✗"}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-1 flex-1 text-right">{q?.question}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 fade-in-up pb-4">
          {/* Copy link */}
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-2">رابط التحدي:</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl} className="flex-1 text-xs bg-muted rounded-lg px-2 py-1 text-muted-foreground text-left" />
              <button onClick={copyLink} className="text-xs bg-secondary/20 border border-secondary/30 text-secondary px-3 py-1 rounded-lg hover:bg-secondary/30 transition-colors shrink-0">
                {copied ? "✓ تم" : "نسخ"}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => navigate("/")} variant="outline" className="flex-1 h-12 rounded-xl border-border">
              🏠 الرئيسية
            </Button>
            <Button
              onClick={() => navigate("/create")}
              className="flex-1 h-12 rounded-xl text-white font-bold hover:opacity-90"
              style={{ background: category ? `linear-gradient(135deg, ${category.gradientFrom}, ${category.gradientTo})` : "hsl(270 60% 40%)" }}
            >
              ⚔️ تحدي جديد
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
