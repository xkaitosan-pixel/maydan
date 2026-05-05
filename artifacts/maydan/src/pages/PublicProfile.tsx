import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { getPublicProfile, addFriend, isFriend } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import type { DbUser } from "@/lib/AuthContext";
import { getCountryFlag } from "@/lib/countryUtils";
import { getLevelInfo, ACHIEVEMENTS } from "@/lib/gamification";
import { CATEGORIES } from "@/lib/questions";
import { ArrowRight, Trophy, Flame, Target, Share2, UserPlus, Check } from "lucide-react";

export default function PublicProfile() {
  const params = useParams<{ userId: string }>();
  const [, navigate] = useLocation();
  const { dbUser, isGuest } = useAuth();
  const userId = params.userId;

  const [profile, setProfile] = useState<DbUser | null | "missing">(null);
  const [alreadyFriend, setAlreadyFriend] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const isMe = !!dbUser?.id && dbUser.id === userId;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getPublicProfile(userId).then((p) => {
      if (cancelled) return;
      setProfile(p ?? "missing");
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!dbUser?.id || !userId || isMe) return;
    isFriend(dbUser.id, userId).then(setAlreadyFriend);
  }, [dbUser?.id, userId, isMe]);

  async function handleAddFriend() {
    if (!dbUser?.id || !profile || profile === "missing" || isGuest) return;
    setAdding(true);
    const ok = await addFriend({
      user_id: dbUser.id,
      friend_id: profile.id,
      friend_name: profile.display_name ?? profile.username ?? null,
      friend_avatar: profile.avatar_url ?? null,
      friend_country: profile.country ?? null,
    });
    setAdding(false);
    if (ok) { setAdded(true); setAlreadyFriend(true); }
  }

  function handleChallenge() {
    if (!profile || profile === "missing") return;
    navigate(`/create?opponent=${encodeURIComponent(profile.id)}&name=${encodeURIComponent(profile.display_name ?? profile.username ?? "")}`);
  }

  function handleShare() {
    if (!profile || profile === "missing") return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL}profile/${profile.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {});
  }

  if (profile === null) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (profile === "missing") {
    return (
      <div className="min-h-screen gradient-hero">
        <div className="rp-narrow p-8 text-center pt-20">
          <p className="text-5xl mb-4">🔍</p>
          <p className="font-bold">الملف غير موجود</p>
          <p className="text-xs text-muted-foreground mt-1">قد يكون الرابط خاطئاً أو تم حذف الحساب.</p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 px-6 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm"
          >
            🏠 الرئيسية
          </button>
        </div>
      </div>
    );
  }

  const flag = getCountryFlag(profile.country ?? "");
  const levelInfo = getLevelInfo(profile.xp ?? 0);
  const wins = profile.total_wins ?? 0;
  const losses = profile.total_losses ?? 0;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  const unlockedIds = Array.isArray(profile.achievements)
    ? (profile.achievements as string[])
    : (() => {
        try {
          const parsed = typeof profile.achievements === "string" ? JSON.parse(profile.achievements) : null;
          return Array.isArray(parsed) ? (parsed as string[]) : (parsed?.unlocked as string[]) ?? [];
        } catch { return []; }
      })();
  const unlockedCount = unlockedIds.length;
  const favCats = (profile.favorite_categories ?? []).map((id) => CATEGORIES.find((c) => c.id === id)).filter(Boolean);

  return (
    <div className="min-h-screen gradient-hero">
      <div className="rp-narrow">
        <header className="p-4 flex items-center gap-3 border-b border-border/30 sticky top-0 bg-background/95 backdrop-blur z-10">
          <button onClick={() => navigate(-1 as any)} className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">الملف العام</h1>
          <button
            onClick={handleShare}
            className="mr-auto text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/40 flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            {shareCopied ? "✓ تم النسخ" : "شارك"}
          </button>
        </header>

        <div className="p-4 space-y-4 pb-24">
          {/* Hero card */}
          <div className="rounded-2xl border border-border/40 bg-card p-5 text-center space-y-3">
            <div className="w-24 h-24 mx-auto rounded-full overflow-hidden border-2 border-primary/40 bg-background">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
              )}
            </div>
            <div>
              <p className="text-xl font-black">{profile.display_name ?? profile.username}</p>
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
            </div>
            <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
              {flag && (
                <span className="px-2.5 py-1 rounded-full bg-background border border-border/40">
                  {flag} {profile.country}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-background border border-border/40 font-bold">
                {levelInfo.current.icon} {levelInfo.current.name}
              </span>
            </div>
            {profile.bio && (
              <p className="text-sm text-muted-foreground italic px-2">"{profile.bio}"</p>
            )}
          </div>

          {/* Action buttons */}
          {!isMe && !isGuest && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleChallenge}
                className="h-12 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90"
              >
                ⚔️ تحدي هذا اللاعب
              </button>
              <button
                onClick={handleAddFriend}
                disabled={adding || alreadyFriend}
                className="h-12 rounded-xl border border-border font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {alreadyFriend || added ? (
                  <><Check className="w-4 h-4 text-green-400" /> صديق</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> {adding ? "..." : "إضافة صديق"}</>
                )}
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatBox icon={<Trophy className="w-4 h-4 text-yellow-400" />} value={wins} label="انتصارات" />
            <StatBox icon={<Target className="w-4 h-4 text-secondary" />} value={`${winRate}%`} label="نسبة الفوز" />
            <StatBox icon={<Flame className="w-4 h-4 text-orange-400" />} value={profile.streak_count ?? 0} label="ستريك" />
          </div>

          {/* Achievements summary */}
          <div className="rounded-2xl border border-border/40 bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">🏅 الإنجازات</h3>
              <span className="text-xs text-muted-foreground">{unlockedCount} / {ACHIEVEMENTS.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id)).slice(0, 12).map((a) => (
                <span
                  key={a.id}
                  title={a.title}
                  className="text-xl rounded-lg p-1.5 border border-yellow-500/20"
                  style={{ background: "rgba(217,119,6,0.08)" }}
                >{a.icon}</span>
              ))}
              {unlockedCount === 0 && (
                <span className="text-xs text-muted-foreground">لم يفتح أي إنجاز بعد</span>
              )}
            </div>
          </div>

          {/* Favorite categories */}
          {favCats.length > 0 && (
            <div className="rounded-2xl border border-border/40 bg-card p-4">
              <h3 className="font-bold text-sm mb-3">⭐ الفئات المفضلة</h3>
              <div className="flex flex-wrap gap-2">
                {favCats.map((c) => (
                  <span key={c!.id} className="text-xs px-2.5 py-1 rounded-full border" style={{ background: `${c!.gradientFrom}22`, color: c!.gradientFrom, borderColor: `${c!.gradientFrom}44` }}>
                    {c!.icon} {c!.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
