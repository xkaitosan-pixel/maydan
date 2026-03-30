import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { getChallenge } from "@/lib/storage";

export default function AcceptChallenge() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const challengeId = params.id;

  useEffect(() => {
    const challenge = getChallenge(challengeId);
    if (!challenge) {
      navigate("/");
      return;
    }

    if (challenge.status === 'completed') {
      // Both played — show results comparison
      navigate(`/results/${challengeId}/challenger`);
    } else {
      // Go play as challenger
      navigate(`/quiz/${challengeId}/challenger`);
    }
  }, [challengeId]);

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
