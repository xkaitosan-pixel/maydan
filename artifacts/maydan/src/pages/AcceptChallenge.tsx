import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { getChallenge, saveChallenge, type ChallengeData } from "@/lib/storage";
import { getDbChallenge } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";

export default function AcceptChallenge() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { session, isGuest, playAsGuest } = useAuth();
  const challengeId = params.id;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Step 1 — try local cache first
      let challenge = getChallenge(challengeId);

      // Step 2 — if not local, hydrate from Supabase so cross-device links work
      if (!challenge) {
        const dbCh = await getDbChallenge(challengeId);
        if (cancelled) return;
        if (!dbCh) {
          setError("هذا التحدي غير موجود أو تم حذفه.");
          return;
        }
        try {
          const safeParseArr = <T,>(s: string | null | undefined, fallback: T[]): T[] => {
            if (!s) return fallback;
            try { const v = JSON.parse(s); return Array.isArray(v) ? v as T[] : fallback; }
            catch { return fallback; }
          };
          const questionIds = safeParseArr<number>(dbCh.question_ids, []);
          const creatorAnswers = safeParseArr<number | null>(dbCh.creator_answers, []);
          const opponentAnswers = safeParseArr<number | null>(dbCh.opponent_answers, []);
          challenge = {
            id: dbCh.id,
            creatorId: dbCh.creator_id ?? "",
            creatorName: dbCh.creator_name,
            categoryId: dbCh.category,
            questionCount: dbCh.question_count,
            questions: questionIds,
            creatorAnswers,
            creatorScore: dbCh.creator_score ?? 0,
            creatorTime: 0,
            createdAt: dbCh.created_at,
            status: dbCh.status === "completed" ? "completed" : "waiting",
            // Opponent / challenger fields — populated when another player has finished.
            challengerName: dbCh.opponent_name ?? undefined,
            challengerAnswers: opponentAnswers.length ? opponentAnswers : undefined,
            challengerScore: dbCh.opponent_score ?? undefined,
          } as ChallengeData;
          saveChallenge(challenge);
        } catch (e) {
          console.error("[AcceptChallenge] failed to hydrate db challenge", e);
          setError("تعذّر تحميل التحدي. حاول لاحقاً.");
          return;
        }
      }

      if (cancelled) return;

      // Step 3 — make sure we have *some* identity so Quiz/Results can render.
      // No login required: anyone with the link can play as guest.
      if (!session && !isGuest) {
        playAsGuest();
      }

      // Step 4 — route into the experience
      if (challenge.status === "completed") {
        navigate(`/results/${challengeId}/challenger`);
      } else {
        navigate(`/quiz/${challengeId}/challenger`);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [challengeId, session, isGuest, playAsGuest, navigate]);

  if (error) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-6">
        <div className="text-center fade-in-up max-w-sm">
          <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <p className="text-lg font-bold text-foreground mb-2">تعذّر فتح التحدي</p>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="h-11 px-6 rounded-xl gradient-gold text-background font-bold text-sm"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center">
      <div className="text-center fade-in-up">
        <div className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center mx-auto mb-4 gold-glow">
          <span className="text-3xl">⚔️</span>
        </div>
        <p className="text-lg font-bold text-foreground">جاري تحميل التحدي...</p>
      </div>
    </div>
  );
}
