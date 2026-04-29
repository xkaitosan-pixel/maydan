import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { parseAchievementsData, ACHIEVEMENTS, LEVELS } from "@/lib/gamification";
import { Crown, Trophy, Target, Zap, Star, Edit2, Check, X, Camera, Link } from "lucide-react";

import { COUNTRIES, getCountryFlag } from "@/lib/countryUtils";

const PRESET_COLORS = [
  { bg: "9333ea", label: "بنفسجي" },
  { bg: "f59e0b", label: "ذهبي" },
  { bg: "10b981", label: "أخضر" },
  { bg: "3b82f6", label: "أزرق" },
  { bg: "ef4444", label: "أحمر" },
  { bg: "6366f1", label: "نيلي" },
];

function buildAvatarUrl(name: string, bg: string) {
  const encoded = encodeURIComponent(name || "م");
  return `https://ui-avatars.com/api/?name=${encoded}&background=${bg}&color=fff&size=128&bold=true&font-size=0.5`;
}

export default function Profile() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, googleDisplayName, signOut, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState(dbUser?.display_name ?? dbUser?.username ?? "");
  const [country, setCountry] = useState(dbUser?.country ?? "");
  const [bio, setBio] = useState(dbUser?.bio ?? "");
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarUrlInput, setAvatarUrlInput] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    setDisplayName(dbUser?.display_name ?? dbUser?.username ?? "");
    setCountry(dbUser?.country ?? "");
    setBio(dbUser?.bio ?? "");
  }, [dbUser]);

  const totalGames = (dbUser?.total_wins ?? 0) + (dbUser?.total_losses ?? 0);
  const winRate = totalGames > 0 ? Math.round(((dbUser?.total_wins ?? 0) / totalGames) * 100) : 0;

  const achData = dbUser ? parseAchievementsData(dbUser.achievements) : null;
  const unlockedAchs = ACHIEVEMENTS.filter(a => achData?.unlocked?.includes(a.id)).slice(-5);

  const currentLevel = LEVELS[Math.min(dbUser?.level ?? 1, LEVELS.length) - 1];
  const nextLevel = LEVELS[Math.min(dbUser?.level ?? 1, LEVELS.length)];
  const xpProgress = currentLevel && nextLevel
    ? Math.min(100, Math.round(((dbUser?.xp ?? 0) - currentLevel.xp) / (nextLevel.xp - currentLevel.xp) * 100))
    : 100;

  const avatarName = displayName || dbUser?.username || googleDisplayName || "م";

  async function handleSave() {
    if (!dbUser) return;
    setSaving(true);
    const { error } = await supabase.from("users").update({
      display_name: displayName.trim() || null,
      country: country || null,
      bio: bio.trim() || null,
    }).eq("id", dbUser.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  async function saveAvatarUrl(url: string) {
    if (!dbUser || !url.trim()) return;
    setSavingAvatar(true);
    setAvatarError("");
    const { error } = await supabase.from("users").update({ avatar_url: url.trim() }).eq("id", dbUser.id);
    setSavingAvatar(false);
    if (error) {
      setAvatarError("فشل الحفظ. تحقق من الرابط وحاول مرة أخرى.");
      return;
    }
    await refreshUser();
    setEditingAvatar(false);
    setAvatarUrlInput("");
  }

  async function handleSaveAvatarUrl() {
    if (!avatarUrlInput.trim()) return;
    await saveAvatarUrl(avatarUrlInput.trim());
  }

  const flagInfo = COUNTRIES.find(c => c.code === country);

  return (
    <div className="min-h-screen gradient-hero flex flex-col" dir="rtl">
      <header className="p-4 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-xl transition-colors">←</button>
        <h1 className="text-lg font-bold">الملف الشخصي</h1>
        {!isGuest && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="mr-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-background disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            {saved ? <><Check className="w-4 h-4" /> تم الحفظ</> : saving ? "جاري..." : <><Edit2 className="w-4 h-4" /> حفظ</>}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full pb-8">

        {/* Avatar + name */}
        <div className="rounded-2xl border border-border/40 bg-card p-6 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div className="relative group cursor-pointer" onClick={() => !isGuest && setEditingAvatar(v => !v)}>
              {dbUser?.avatar_url ? (
                <img src={dbUser.avatar_url} alt={avatarName}
                  className="w-20 h-20 rounded-full border-2 border-yellow-500 object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full border-2 border-yellow-500 bg-muted flex items-center justify-center text-3xl font-black">
                  {avatarName.charAt(0)}
                </div>
              )}
              {!isGuest && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            {dbUser?.is_premium && (
              <span className="absolute -top-1 -left-1 bg-yellow-500 rounded-full p-0.5">
                <Crown className="w-3.5 h-3.5 text-black" />
              </span>
            )}
            {flagInfo && (
              <span className="absolute -bottom-1 -right-1 text-xl">{flagInfo.flag}</span>
            )}
          </div>

          {/* Avatar editor */}
          {editingAvatar && !isGuest && (
            <div className="w-full bg-background border border-border rounded-xl p-3 space-y-4 text-right">
              <p className="text-xs font-bold text-muted-foreground">تغيير الصورة الشخصية</p>

              {/* Preset avatars */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">اختر صورة جاهزة</p>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map(({ bg, label }) => {
                    const url = buildAvatarUrl(avatarName, bg);
                    return (
                      <button
                        key={bg}
                        onClick={() => saveAvatarUrl(url)}
                        disabled={savingAvatar}
                        title={label}
                        className="rounded-full overflow-hidden border-2 border-transparent hover:border-primary transition-all disabled:opacity-50 focus:outline-none focus:border-primary"
                      >
                        <img src={url} alt={label} className="w-full h-auto aspect-square" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* URL input */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">أو الصق رابط صورة مباشرة</p>
                <div className="flex gap-2">
                  <input
                    value={avatarUrlInput}
                    onChange={e => setAvatarUrlInput(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 h-10 bg-card border border-border rounded-xl px-3 text-sm text-foreground outline-none focus:border-primary"
                    dir="ltr"
                  />
                  <button
                    onClick={handleSaveAvatarUrl}
                    disabled={!avatarUrlInput.trim() || savingAvatar}
                    className="h-10 px-3 rounded-xl text-sm font-bold text-background disabled:opacity-40 flex items-center gap-1"
                    style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                  >
                    <Link className="w-3.5 h-3.5" />
                    {savingAvatar ? "..." : "حفظ"}
                  </button>
                </div>
              </div>

              {avatarError && <p className="text-destructive text-xs">{avatarError}</p>}
              <button
                onClick={() => { setEditingAvatar(false); setAvatarError(""); setAvatarUrlInput(""); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                إلغاء
              </button>
            </div>
          )}

          {/* Editable display name */}
          {!isGuest && (
            <div className="w-full">
              {editingName ? (
                <div className="flex gap-2 justify-center">
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="flex-1 h-10 bg-background border border-border rounded-xl px-3 text-center text-foreground text-sm outline-none focus:border-primary"
                    maxLength={30}
                    autoFocus
                  />
                  <button onClick={() => setEditingName(false)} className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setDisplayName(dbUser?.display_name ?? dbUser?.username ?? ""); setEditingName(false); }} className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditingName(true)} className="flex items-center gap-2 mx-auto text-foreground hover:text-primary transition-colors">
                  <h2 className="text-xl font-black">{displayName || dbUser?.username || googleDisplayName}</h2>
                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">@{dbUser?.username}</p>
            </div>
          )}
          {isGuest && <h2 className="text-xl font-black text-muted-foreground">زائر</h2>}

          {dbUser?.is_premium && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2.5 py-1 rounded-full font-bold">ميدان برو 👑</span>
          )}
        </div>

        {/* XP & Level */}
        {dbUser && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">المستوى {dbUser.level}</span>
              <span className="text-xs text-muted-foreground">{dbUser.xp} XP</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${xpProgress}%`, background: "linear-gradient(90deg,#7c3aed,#d97706)" }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{currentLevel?.name}</span>
              {nextLevel && <span>{nextLevel.name} ←</span>}
            </div>
          </div>
        )}

        {/* Editable profile fields */}
        {!isGuest && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-4">
            <h3 className="font-bold text-sm">تعديل الملف</h3>

            {/* Country */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">🌍 الدولة</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="w-full h-11 bg-background border border-border rounded-xl px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">اختر دولتك</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>

            {/* Bio */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">
                📝 نبذة قصيرة <span className="opacity-50">({bio.length}/50)</span>
              </label>
              <input
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 50))}
                placeholder="أخبر الآخرين عنك..."
                className="w-full h-11 bg-background border border-border rounded-xl px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Trophy className="w-5 h-5 text-yellow-400" />} label="الانتصارات" value={dbUser?.total_wins ?? 0} />
          <StatCard icon={<Target className="w-5 h-5 text-purple-400" />} label="نسبة الفوز" value={`${winRate}%`} />
          <StatCard icon={<Zap className="w-5 h-5 text-orange-400" />} label="أطول سلسلة" value={dbUser?.longest_streak ?? 0} />
          <StatCard icon={<Star className="w-5 h-5 text-blue-400" />} label="إجمالي المباريات" value={totalGames} />
        </div>

        {/* Achievements preview */}
        {unlockedAchs.length > 0 && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm">آخر الإنجازات</h3>
              <button onClick={() => navigate("/achievements")} className="text-xs text-primary">عرض الكل ←</button>
            </div>
            <div className="flex gap-3 flex-wrap">
              {unlockedAchs.map(a => (
                <div key={a.id} title={a.title} className="flex flex-col items-center gap-1 w-14 text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-primary/10 border border-primary/20">
                    {a.icon}
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{a.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {!isGuest && !dbUser?.is_premium && (
            <button onClick={() => navigate("/premium")}
              className="w-full h-12 rounded-xl font-bold text-background gradient-gold">
              ترقية إلى ميدان برو 👑
            </button>
          )}
          <button onClick={handleSignOut}
            className="w-full h-12 rounded-xl border border-border text-muted-foreground font-bold bg-card hover:bg-card/80 transition-colors text-sm">
            {isGuest ? "تسجيل الدخول" : "تسجيل الخروج"}
          </button>
        </div>
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
