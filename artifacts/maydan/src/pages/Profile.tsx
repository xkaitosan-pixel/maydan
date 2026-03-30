import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { Crown, Star, Zap, Trophy, Target, Calendar } from "lucide-react";

export default function Profile() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, googleDisplayName, signOut } = useAuth();

  const username = dbUser?.username ?? googleDisplayName ?? "زائر";
  const totalGames = (dbUser?.total_wins ?? 0) + (dbUser?.total_losses ?? 0);
  const winRate = totalGames > 0 ? Math.round(((dbUser?.total_wins ?? 0) / totalGames) * 100) : 0;

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col" dir="rtl">
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl transition-colors">←</button>
        <h1 className="text-lg font-bold">الملف الشخصي</h1>
      </header>

      <div className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
        <div className="rounded-2xl border border-border/40 bg-card p-6 flex flex-col items-center gap-3 text-center">
          {dbUser?.avatar_url ? (
            <div className="relative">
              <img
                src={dbUser.avatar_url}
                alt={username}
                className="w-20 h-20 rounded-full border-2 border-yellow-500 object-cover"
              />
              {dbUser?.is_premium && (
                <span className="absolute -top-1 -left-1 bg-yellow-500 rounded-full p-0.5">
                  <Crown className="w-3.5 h-3.5 text-black" />
                </span>
              )}
            </div>
          ) : (
            <div className="relative w-20 h-20 rounded-full border-2 border-yellow-500 bg-muted flex items-center justify-center text-3xl">
              {username.charAt(0)}
              {dbUser?.is_premium && (
                <span className="absolute -top-1 -left-1 bg-yellow-500 rounded-full p-0.5">
                  <Crown className="w-3.5 h-3.5 text-black" />
                </span>
              )}
            </div>
          )}
          <div>
            <h2 className="text-xl font-black">{username}</h2>
            {dbUser?.is_premium && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2.5 py-1 rounded-full font-bold">
                ميدان برو 👑
              </span>
            )}
            {isGuest && (
              <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                زائر
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Trophy className="w-5 h-5 text-yellow-400" />} label="الانتصارات" value={dbUser?.total_wins ?? 0} />
          <StatCard icon={<Target className="w-5 h-5 text-purple-400" />} label="نسبة الفوز" value={`${winRate}%`} />
          <StatCard icon={<Zap className="w-5 h-5 text-orange-400" />} label="السلسلة الحالية" value={dbUser?.streak_count ?? 0} />
          <StatCard icon={<Star className="w-5 h-5 text-blue-400" />} label="النقاط الكلية" value={(dbUser?.total_points ?? 0).toLocaleString("ar")} />
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground">إحصائيات</h3>
          <Row label="إجمالي المباريات" value={totalGames} />
          <Row label="أطول سلسلة" value={dbUser?.longest_streak ?? 0} />
          <Row label="الخسائر" value={dbUser?.total_losses ?? 0} />
          {dbUser?.created_at && (
            <Row
              label="عضو منذ"
              value={new Date(dbUser.created_at).toLocaleDateString("ar", { year: "numeric", month: "long" })}
            />
          )}
        </div>

        {!isGuest && (
          <div className="space-y-2">
            {!dbUser?.is_premium && (
              <button
                onClick={() => navigate("/premium")}
                className="w-full h-12 rounded-xl font-bold text-background gradient-gold"
              >
                ترقية إلى ميدان برو 👑
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="w-full h-12 rounded-xl border border-border text-muted-foreground font-bold bg-card hover:bg-card/80 transition-colors text-sm"
            >
              تسجيل الخروج
            </button>
          </div>
        )}

        {isGuest && (
          <button
            onClick={() => navigate("/")}
            className="w-full h-12 rounded-xl font-bold text-background gradient-gold"
          >
            سجّل دخولك لحفظ إنجازاتك
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 flex flex-col items-center gap-2 text-center">
      {icon}
      <span className="text-xl font-black">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
