import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { parseAchievementsData, ACHIEVEMENTS, LEVELS } from "@/lib/gamification";
import { Crown, Trophy, Target, Zap, Star, Edit2, Check, X, Camera, Swords, Bell, Users, Share2, Link2, Settings as SettingsIcon } from "lucide-react";

import { COUNTRIES, getCountryFlag } from "@/lib/countryUtils";
import { CATEGORIES, getCategoryById } from "@/lib/questions";
import { getMyChallenges, getFriends, removeFriend, type DbChallenge, type Friend } from "@/lib/db";
import {
  NOTIF_TYPES,
  getNotifPrefs,
  setNotifPref,
  type NotifType,
} from "@/lib/notifications";

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
  const [selectedChallenge, setSelectedChallenge] = useState<DbChallenge | null>(null);

  // Friends
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  function handleCopyProfileLink() {
    if (!dbUser?.id) return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL}profile/${dbUser.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }

  // Notification preferences
  const [notifPrefs, setNotifPrefsState] = useState<Record<NotifType, boolean>>(() => getNotifPrefs());
  function toggleNotifPref(type: NotifType) {
    const next = !notifPrefs[type];
    setNotifPref(type, next);
    setNotifPrefsState((prev) => ({ ...prev, [type]: next }));
  }

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
    getFriends(dbUser.id).then((rows) => {
      if (!cancelled) setFriends(rows);
    });
    return () => { cancelled = true; };
  }, [dbUser?.id, isGuest]);

  function handleShareProfile() {
    if (!dbUser?.id) return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL}profile/${dbUser.id}`;
    const lvl = dbUser.level ?? 1;
    const wins = dbUser.total_wins ?? 0;
    const name = dbUser.display_name || dbUser.username || "لاعب ميدان";
    const text = `🎯 شوف ملفي في ميدان!\n👤 ${name}\n⭐ المستوى: ${lvl}\n🏆 الانتصارات: ${wins}\n👇 جرّب التحدي\n${url}`;
    // Try native share first; on failure copy the rich text to clipboard.
    const nav: any = navigator;
    if (nav.share) {
      nav.share({ title: "ملفي في ميدان", text, url }).catch(() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      });
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {});
  }

  async function handleRemoveFriend(friendId: string) {
    if (!dbUser?.id) return;
    const ok = await removeFriend(dbUser.id, friendId);
    if (ok) setFriends((prev) => (prev ?? []).filter((f) => f.friend_id !== friendId));
  }

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
        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={() => navigate("/settings")}
            className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="الإعدادات"
            aria-label="الإعدادات"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          {!isGuest && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-background disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
            >
              {saved ? <><Check className="w-4 h-4" /> تم الحفظ</> : saving ? "جاري..." : <><Edit2 className="w-4 h-4" /> حفظ</>}
            </button>
          )}
        </div>
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

              {/* 8 avatars grid per style (32 total across 4 tabs) */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }, (_, i) => i + 1).map(seed => {
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
              {dbUser?.created_at && (
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  📅 انضم في {new Date(dbUser.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
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
                onClick={() => navigate("/create")}
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
              <div className="text-center py-6">
                <p className="text-4xl mb-2">⚔️</p>
                <p className="text-sm text-foreground font-bold">
                  لم ترسل أي تحدي بعد!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ابدأ الآن وتحدَّ صديقك
                </p>
                <button
                  onClick={() => navigate("/create")}
                  className="mt-3 px-5 py-2 rounded-xl text-xs font-bold text-background"
                  style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                >
                  إنشاء تحدي جديد
                </button>
              </div>
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
                      onClick={() => setSelectedChallenge(ch)}
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

        {/* Friends list */}
        {!isGuest && dbUser && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" /> الأصدقاء
                {friends && <span className="text-xs text-muted-foreground font-normal">({friends.length})</span>}
              </h3>
            </div>
            {friends === null ? (
              <p className="text-xs text-muted-foreground text-center py-3">جاري التحميل...</p>
            ) : friends.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-3xl mb-1">👥</p>
                <p className="text-xs text-muted-foreground">لا أصدقاء بعد — أضفهم بعد التحديات أو من ملفاتهم العامة.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {friends.map((f) => {
                  const flag = getCountryFlag(f.friend_country ?? "");
                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-3 p-2 rounded-xl border border-border/30 bg-background"
                    >
                      <button
                        onClick={() => navigate(`/profile/${f.friend_id}`)}
                        className="flex items-center gap-3 flex-1 text-right hover:opacity-80"
                      >
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center text-sm">
                          {f.friend_avatar ? <img src={f.friend_avatar} alt="" className="w-full h-full object-cover" /> : "👤"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight truncate">{f.friend_name ?? "صديق"}</p>
                          {flag && <p className="text-[10px] text-muted-foreground">{flag}</p>}
                        </div>
                      </button>
                      <button
                        onClick={() => navigate(`/create?opponent=${encodeURIComponent(f.friend_id)}&name=${encodeURIComponent(f.friend_name ?? "")}`)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                      >⚔️ تحدي</button>
                      <button
                        onClick={() => handleRemoveFriend(f.friend_id)}
                        className="text-muted-foreground hover:text-red-400 text-xs"
                        title="إزالة"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Share + Copy link + Settings shortcuts */}
        {!isGuest && dbUser && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleShareProfile}
              className="h-11 rounded-xl border border-border bg-card font-bold text-xs flex items-center justify-center gap-1.5 hover:border-primary/40"
            >
              <Share2 className="w-4 h-4" />
              {shareCopied ? "✓ تم" : "شارك"}
            </button>
            <button
              onClick={handleCopyProfileLink}
              className="h-11 rounded-xl border border-border bg-card font-bold text-xs flex items-center justify-center gap-1.5 hover:border-primary/40"
              title="نسخ رابط الملف"
            >
              <Link2 className="w-4 h-4" />
              {linkCopied ? "✓ نُسخ" : "نسخ الرابط"}
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="h-11 rounded-xl border border-border bg-card font-bold text-xs flex items-center justify-center gap-1.5 hover:border-primary/40"
            >
              <SettingsIcon className="w-4 h-4" /> الإعدادات
            </button>
          </div>
        )}

        {/* Notification preferences */}
        {!isGuest && dbUser && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-primary" /> الإشعارات
            </h3>
            <p className="text-[11px] text-muted-foreground -mt-1">
              تحكّم في أنواع الإشعارات التي تظهر لك
            </p>
            <div className="space-y-1.5">
              {NOTIF_TYPES.map(({ type, icon, label, desc }) => {
                const enabled = notifPrefs[type] !== false;
                return (
                  <button
                    key={type}
                    onClick={() => toggleNotifPref(type)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/30 bg-background hover:border-primary/40 transition-colors text-right"
                  >
                    <span className="text-xl shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold leading-tight">{label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {desc}
                      </p>
                    </div>
                    <div
                      className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0"
                      style={{
                        background: enabled
                          ? "linear-gradient(135deg,#d97706,#f59e0b)"
                          : "rgba(255,255,255,0.1)",
                      }}
                      role="switch"
                      aria-checked={enabled}
                    >
                      <div
                        className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                        style={{
                          transform: enabled ? "translateX(-16px)" : "translateX(0)",
                        }}
                      />
                    </div>
                  </button>
                );
              })}
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

      {/* Challenge details modal */}
      {selectedChallenge && (() => {
        const ch = selectedChallenge;
        const cat = getCategoryById(ch.category);
        const cs = ch.creator_score ?? 0;
        const os = ch.opponent_score ?? 0;
        const isCreator = ch.creator_id === dbUser?.id;
        const myScore = isCreator ? cs : os;
        const oppScore = isCreator ? os : cs;
        const oppName = isCreator ? (ch.opponent_name || "بانتظار خصم") : ch.creator_name;
        const completed = ch.status === "completed";
        let badge: { icon: string; text: string; color: string };
        if (!completed) badge = { icon: "⏳", text: "قيد الانتظار", color: "#a78bfa" };
        else if (myScore > oppScore) badge = { icon: "🏆", text: "فوز", color: "#22c55e" };
        else if (myScore < oppScore) badge = { icon: "💔", text: "خسارة", color: "#ef4444" };
        else badge = { icon: "🤝", text: "تعادل", color: "#f59e0b" };
        const dateStr = ch.created_at ? new Date(ch.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "";
        return (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-enter"
            onClick={() => setSelectedChallenge(null)}
          >
            <div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black">تفاصيل التحدي</h3>
                <button onClick={() => setSelectedChallenge(null)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
              </div>

              <div className="flex items-center justify-center gap-2 py-2">
                <span className="text-2xl">{cat?.icon ?? "🎯"}</span>
                <span className="text-sm font-bold">{cat?.name ?? ch.category}</span>
              </div>

              {/* Players + scores */}
              <div className="flex items-center justify-around">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-14 h-14 rounded-full bg-secondary/20 flex items-center justify-center text-xl font-black border border-border">
                    {(dbUser?.display_name || dbUser?.username || "أ").charAt(0)}
                  </div>
                  <p className="text-xs font-bold truncate max-w-[80px]">أنت</p>
                  <p className="text-2xl font-black text-primary">{completed ? myScore : "—"}</p>
                </div>
                <span className="text-xl text-muted-foreground">VS</span>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-black border border-border">
                    {(oppName || "?").charAt(0)}
                  </div>
                  <p className="text-xs font-bold truncate max-w-[80px]">{oppName}</p>
                  <p className="text-2xl font-black text-primary">{completed ? oppScore : "—"}</p>
                </div>
              </div>

              <div
                className="text-center py-2.5 rounded-xl font-black text-sm"
                style={{ background: badge.color + "22", color: badge.color, border: `1px solid ${badge.color}55` }}
              >
                {badge.icon} {badge.text}
              </div>

              {dateStr && (
                <p className="text-xs text-center text-muted-foreground">📅 {dateStr}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setSelectedChallenge(null); navigate(`/create?category=${ch.category}`); }}
                  className="flex-1 h-11 rounded-xl gradient-gold text-background font-bold text-sm hover:opacity-90"
                >
                  ⚔️ تحدّ مجدداً
                </button>
                <button
                  onClick={() => setSelectedChallenge(null)}
                  className="flex-1 h-11 rounded-xl border border-border text-muted-foreground font-bold text-sm bg-card hover:bg-card/80"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
