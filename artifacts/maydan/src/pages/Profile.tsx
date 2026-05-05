import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { parseAchievementsData, ACHIEVEMENTS, LEVELS } from "@/lib/gamification";
import { Crown, Trophy, Target, Zap, Star, Edit2, Check, X, Camera, Swords } from "lucide-react";

import { COUNTRIES } from "@/lib/countryUtils";
import { CATEGORIES, getCategoryById } from "@/lib/questions";
import { getMyChallenges, type DbChallenge } from "@/lib/db";

const FAV_CAT_LIMIT = 3;

const AVATAR_STYLES = [
  { id: "adventurer", label: "مغامرين" },
  { id: "bottts", label: "روبوتات" },
  { id: "pixel-art", label: "بكسل" },
  { id: "fun-emoji", label: "إيموجي" },
] as const;

type StyleId = (typeof AVATAR_STYLES)[number]["id"];

function buildDicebearUrl(style: string, seed: string | number) {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(String(seed))}`;
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
  const [activeStyle, setActiveStyle] = useState<StyleId>("adventurer");
  const [selectedAvatar, setSelectedAvatar] = useState<string>("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  // Sent challenges
  const [myChallenges, setMyChallenges] = useState<DbChallenge[] | null>(null);

  // Favorite categories
  const [editingFavs, setEditingFavs] = useState(false);
  const [favDraft, setFavDraft] = useState<string[]>([]);
  const [savingFavs, setSavingFavs] = useState(false);
  const [favsSaved, setFavsSaved] = useState(false);

  useEffect(() => {
    setDisplayName(dbUser?.display_name ?? dbUser?.username ?? "");
    setCountry(dbUser?.country ?? "");
    setBio(dbUser?.bio ?? "");
    setFavDraft(dbUser?.favorite_categories ?? []);
  }, [dbUser]);

  useEffect(() => {
    if (!dbUser?.id || isGuest) return;
    let cancelled = false;
    getMyChallenges(dbUser.id, 10).then((rows) => {
      if (!cancelled) setMyChallenges(rows);
    });
    return () => { cancelled = true; };
  }, [dbUser?.id, isGuest]);

  const totalGames = (dbUser?.total_wins ?? 0) + (dbUser?.total_losses ?? 0);
  const winRate = totalGames > 0 ? Math.round(((dbUser?.total_wins ?? 0) / totalGames) * 100) : 0;

  const achData = dbUser ? parseAchievementsData(dbUser.achievements) : null;
  const unlockedAchs = ACHIEVEMENTS.filter(a => achData?.unlocked?.includes(a.id)).slice(-5);

  const currentLevel = LEVELS[Math.min(dbUser?.level ?? 1, LEVELS.length) - 1];
  const nextLevel = LEVELS[Math.min(dbUser?.level ?? 1, LEVELS.length)];
  const xpProgress = currentLevel && nextLevel
    ? Math.min(100, Math.round(((dbUser?.xp ?? 0) - currentLevel.xp) / (nextLevel.xp - currentLevel.xp) * 100))
    : 100;

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

  function toggleFav(id: string) {
    setFavDraft((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= FAV_CAT_LIMIT) return prev;
      return [...prev, id];
    });
  }

  async function handleSaveFavs() {
    if (!dbUser || favDraft.length === 0) return;
    setSavingFavs(true);
    const { error } = await supabase
      .from("users")
      .update({ favorite_categories: favDraft })
      .eq("id", dbUser.id);
    setSavingFavs(false);
    if (!error) {
      setFavsSaved(true);
      await refreshUser();
      setTimeout(() => {
        setFavsSaved(false);
        setEditingFavs(false);
      }, 1200);
    }
  }

  async function handleSaveAvatar() {
    if (!dbUser || !selectedAvatar) return;
    setSavingAvatar(true);
    setAvatarError("");
    const { error } = await supabase
      .from("users")
      .update({ avatar_url: selectedAvatar })
      .eq("id", dbUser.id);
    setSavingAvatar(false);
    if (error) {
      setAvatarError("فشل الحفظ. حاول مرة أخرى.");
      return;
    }
    setAvatarSaved(true);
    await refreshUser();
    setTimeout(() => {
      setAvatarSaved(false);
      setEditingAvatar(false);
      setSelectedAvatar("");
    }, 1200);
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
            <div
              className="relative group cursor-pointer"
              onClick={() => {
                if (isGuest) return;
                setEditingAvatar(v => !v);
                setSelectedAvatar("");
                setAvatarError("");
              }}
            >
              {dbUser?.avatar_url ? (
                <img
                  src={dbUser.avatar_url}
                  alt={displayName}
                  className="w-20 h-20 rounded-full border-2 border-yellow-500 object-cover bg-white"
                />
              ) : (
                <div className="w-20 h-20 rounded-full border-2 border-yellow-500 bg-muted flex items-center justify-center text-3xl font-black">
                  {(displayName || googleDisplayName || "م").charAt(0)}
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
            <div className="w-full bg-background border border-border rounded-xl p-3 space-y-3 text-right">
              <p className="text-xs font-bold text-muted-foreground">تغيير الصورة</p>

              {/* Style tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {AVATAR_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setActiveStyle(s.id); setSelectedAvatar(""); }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      activeStyle === s.id
                        ? "text-background"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground"
                    }`}
                    style={activeStyle === s.id ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* 12 avatars grid */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(seed => {
                  const url = buildDicebearUrl(activeStyle, seed);
                  const isSelected = selectedAvatar === url;
                  return (
                    <button
                      key={seed}
                      onClick={() => setSelectedAvatar(url)}
                      className={`rounded-full overflow-hidden border-2 transition-all bg-white ${
                        isSelected
                          ? "border-yellow-500 scale-105 shadow-lg shadow-yellow-500/30"
                          : "border-transparent hover:border-border"
                      }`}
                    >
                      <img src={url} alt={`Avatar ${seed}`} className="w-full h-auto aspect-square" loading="lazy" />
                    </button>
                  );
                })}
              </div>

              {avatarError && <p className="text-destructive text-xs">{avatarError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveAvatar}
                  disabled={!selectedAvatar || savingAvatar}
                  className="flex-1 h-10 rounded-xl text-sm font-bold text-background disabled:opacity-40 flex items-center justify-center gap-1.5"
                  style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                >
                  {avatarSaved ? <><Check className="w-4 h-4" /> تم الحفظ</> : savingAvatar ? "جاري..." : "حفظ"}
                </button>
                <button
                  onClick={() => { setEditingAvatar(false); setSelectedAvatar(""); setAvatarError(""); }}
                  className="h-10 px-4 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground"
                >
                  إلغاء
                </button>
              </div>
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

        {/* Favorite categories */}
        {!isGuest && dbUser && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">⭐ فئاتي المفضلة</h3>
              {!editingFavs ? (
                <button
                  onClick={() => { setEditingFavs(true); setFavDraft(dbUser.favorite_categories ?? []); }}
                  className="text-xs text-primary flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> تعديل
                </button>
              ) : (
                <button
                  onClick={() => { setEditingFavs(false); setFavDraft(dbUser.favorite_categories ?? []); }}
                  className="text-xs text-muted-foreground"
                >
                  إلغاء
                </button>
              )}
            </div>

            {!editingFavs ? (
              (dbUser.favorite_categories?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  لم تختر فئات بعد — اضغط "تعديل" لاختيار 3 فئات مفضلة
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(dbUser.favorite_categories ?? []).slice(0, FAV_CAT_LIMIT).map(id => {
                    const c = getCategoryById(id);
                    if (!c) return null;
                    return (
                      <div
                        key={id}
                        className="rounded-xl p-3 flex flex-col items-center gap-1 text-center text-white"
                        style={{ background: `linear-gradient(135deg, ${c.gradientFrom}, ${c.gradientTo})` }}
                      >
                        <span className="text-2xl">{c.icon}</span>
                        <span className="text-[10px] font-bold leading-tight">{c.name}</span>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground text-center">
                  اختر {FAV_CAT_LIMIT} فئات — مختار: {favDraft.length}/{FAV_CAT_LIMIT}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.filter(c => !c.isPremium).map(c => {
                    const isSel = favDraft.includes(c.id);
                    const isDisabled = !isSel && favDraft.length >= FAV_CAT_LIMIT;
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleFav(c.id)}
                        disabled={isDisabled}
                        className={`rounded-xl p-2.5 flex flex-col items-center gap-1 text-center transition-all border-2 ${
                          isSel ? "border-yellow-500 scale-[1.02]" : "border-transparent"
                        } ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
                        style={{
                          background: isSel
                            ? `linear-gradient(135deg, ${c.gradientFrom}, ${c.gradientTo})`
                            : "hsl(var(--background))",
                          color: isSel ? "white" : undefined,
                        }}
                      >
                        <span className="text-xl">{c.icon}</span>
                        <span className="text-[10px] font-bold leading-tight">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={handleSaveFavs}
                  disabled={favDraft.length === 0 || savingFavs}
                  className="w-full h-10 rounded-xl text-sm font-bold text-background disabled:opacity-40 flex items-center justify-center gap-1.5"
                  style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                >
                  {favsSaved ? <><Check className="w-4 h-4" /> تم الحفظ</> : savingFavs ? "جاري..." : "حفظ"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sent challenges */}
        {!isGuest && dbUser && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-primary" /> تحدياتي
              </h3>
              <button
                onClick={() => navigate("/challenge/create")}
                className="text-xs text-primary"
              >
                + جديد
              </button>
            </div>

            {myChallenges === null ? (
              <div className="flex justify-center py-3">
                <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              </div>
            ) : myChallenges.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                لم ترسل أي تحدٍ بعد — تحدَّ صديقك الآن!
              </p>
            ) : (
              <div className="space-y-2">
                {myChallenges.map(ch => {
                  const cat = getCategoryById(ch.category);
                  const isPending = ch.status !== "completed";
                  const my = ch.creator_score ?? 0;
                  const opp = ch.opponent_score ?? 0;
                  let badge: { icon: string; text: string; color: string };
                  if (isPending) {
                    badge = { icon: "⏳", text: "في الانتظار", color: "#a3a3a3" };
                  } else if (my > opp) {
                    badge = { icon: "🏆", text: "فزت", color: "#22c55e" };
                  } else if (opp > my) {
                    badge = { icon: "❌", text: "خسرت", color: "#ef4444" };
                  } else {
                    badge = { icon: "🤝", text: "تعادل", color: "#f59e0b" };
                  }
                  return (
                    <button
                      key={ch.id}
                      onClick={() => navigate(`/results/${ch.id}/creator`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-background hover:border-primary/40 transition-colors text-right"
                    >
                      <span className="text-2xl">{cat?.icon ?? "🎯"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          ضد {ch.opponent_name || "بانتظار خصم"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {cat?.name ?? ch.category}
                          {!isPending && ` • ${my} - ${opp}`}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                        style={{ background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44` }}
                      >
                        {badge.icon} {badge.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
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
