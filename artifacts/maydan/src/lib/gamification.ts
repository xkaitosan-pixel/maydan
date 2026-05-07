import { supabase } from './supabase';

// ─── LEVELS ──────────────────────────────────────────────────────────────────
export const LEVELS = [
  { level: 1, xp: 0,    name: "مبتدئ",       icon: "🥉" },
  { level: 2, xp: 200,  name: "متعلم",        icon: "📚" },
  { level: 3, xp: 500,  name: "محترف",        icon: "⚔️" },
  { level: 4, xp: 1000, name: "فارس",         icon: "🛡️" },
  { level: 5, xp: 2000, name: "بطل",          icon: "🏆" },
  { level: 6, xp: 4000, name: "أسطورة",       icon: "👑" },
  { level: 7, xp: 8000, name: "بطل الميدان",  icon: "🌟" },
];

export function getLevelInfo(xp: number) {
  let current = LEVELS[0];
  let next: (typeof LEVELS)[0] | null = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
      break;
    }
  }
  const xpInLevel = next ? xp - current.xp : 0;
  const xpToNext  = next ? next.xp - current.xp : 1;
  const progress  = next ? Math.min(xpInLevel / xpToNext, 1) : 1;
  return { current, next, xpInLevel, xpToNext, progress };
}

// ─── XP / COIN REWARDS ───────────────────────────────────────────────────────
export const XP_REWARDS = {
  correct_answer:  10,
  win_1v1:         50,
  win_survival_10: 30,
  daily_challenge: 20,
  first_game_day:  15,
  win_ranked:      40,
} as const;

export const COIN_REWARDS = {
  win_1v1:          20,
  daily_challenge:  15,
  win_survival_15:  25,
  first_game_day:   15,
  win_ranked:       30,
} as const;

// ─── ACHIEVEMENTS ────────────────────────────────────────────────────────────
export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  xp: number;
  coins: number;
  totalNeeded: number;
  progressKey: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_game",       icon: "🎯", title: "أول خطوة",       desc: "العب أول لعبة",                  xp: 50,  coins: 20,  totalNeeded: 1,  progressKey: "total_games" },
  { id: "streak_3",         icon: "🔥", title: "متقد",            desc: "حقق ستريك 3 أيام",               xp: 30,  coins: 15,  totalNeeded: 3,  progressKey: "streak_count" },
  { id: "win_5_streak",     icon: "⚡", title: "لا يُهزم",        desc: "فز 5 مباريات متتالية",           xp: 100, coins: 50,  totalNeeded: 5,  progressKey: "consecutive_wins" },
  { id: "correct_50",       icon: "🧠", title: "عبقري",           desc: "أجب 50 سؤال صحيح",              xp: 80,  coins: 40,  totalNeeded: 50, progressKey: "total_correct" },
  { id: "weekly_top",       icon: "👑", title: "سيد الميدان",     desc: "تصدر اللوحة أسبوعياً",          xp: 200, coins: 100, totalNeeded: 1,  progressKey: "weekly_top" },
  { id: "play_30_days",     icon: "🎮", title: "مدمن",            desc: "العب 30 يوماً متتالياً",         xp: 500, coins: 200, totalNeeded: 30, progressKey: "streak_count" },
  { id: "win_tournament",   icon: "🏆", title: "بطل البطولة",     desc: "فز ببطولة كاملة",               xp: 150, coins: 75,  totalNeeded: 1,  progressKey: "tournament_wins" },
  { id: "reach_level_6",    icon: "🌟", title: "أسطورة",          desc: "وصل للمستوى 6",                 xp: 300, coins: 150, totalNeeded: 6,  progressKey: "level" },
  { id: "correct_10_streak",icon: "🎯", title: "قناص",            desc: "أجب 10 أسئلة صح بدون خطأ",     xp: 80,  coins: 40,  totalNeeded: 10, progressKey: "correct_streak" },
  { id: "party_10",         icon: "👥", title: "اجتماعي",         desc: "العب 10 ألعاب جماعية",          xp: 80,  coins: 40,  totalNeeded: 10, progressKey: "party_games" },
  { id: "ranked_25",        icon: "⚔️", title: "المحارب",         desc: "فز 25 مباراة ranked",           xp: 250, coins: 125, totalNeeded: 25, progressKey: "ranked_wins" },
  { id: "play_7_days",      icon: "🔥", title: "الأسبوع الكامل",  desc: "العب 7 أيام متتالية",            xp: 100, coins: 50,  totalNeeded: 7,  progressKey: "streak_count" },
  { id: "survival_top_3",   icon: "💪", title: "الصامد",          desc: "ابقَ آخر شخص في البقاء 3 مرات", xp: 100, coins: 50,  totalNeeded: 3,  progressKey: "survival_wins" },
  { id: "create_5_rooms",   icon: "🎪", title: "المضيف",          desc: "أنشئ 5 غرف تجمعات",             xp: 80,  coins: 40,  totalNeeded: 5,  progressKey: "rooms_created" },
  { id: "play_all_cats",    icon: "🌍", title: "الموسوعة",        desc: "العب كل الفئات الـ 15",         xp: 150, coins: 75,  totalNeeded: 15, progressKey: "categories_count" },
];

// ─── STORE ITEMS ──────────────────────────────────────────────────────────────
export interface FrameItem {
  id: string;
  name: string;
  cost: number;
  border: string;
  shadow: string;
  premium: boolean;
  className?: string;
}

export const FRAMES: FrameItem[] = [
  { id: "gold",        name: "إطار ذهبي",            cost: 200,  border: "2px solid #f59e0b", shadow: "0 0 12px #f59e0b80", premium: false },
  { id: "fire",        name: "إطار ناري",            cost: 300,  border: "2px solid #ef4444", shadow: "0 0 12px #ef444480", premium: false },
  { id: "royal",       name: "إطار ملكي",            cost: 500,  border: "2px solid #8b5cf6", shadow: "0 0 12px #8b5cf680", premium: false },
  { id: "legend",      name: "إطار أسطوري",          cost: 1000, border: "2px solid #06b6d4", shadow: "0 0 12px #06b6d480", premium: false },
  { id: "fire_glow",   name: "إطار اللهب المتوهج",   cost: 800,  border: "3px solid #f97316", shadow: "0 0 18px #f97316cc", premium: false, className: "frame-fire" },
  { id: "electric",    name: "إطار البرق الكهربائي", cost: 1200, border: "3px solid #22d3ee", shadow: "0 0 16px #22d3eecc", premium: false, className: "frame-electric" },
  { id: "ice",         name: "إطار الجليد المتلألئ", cost: 1500, border: "3px solid #93c5fd", shadow: "0 0 14px #93c5fdcc", premium: false, className: "frame-ice" },
  { id: "rainbow",     name: "إطار قوس قزح",         cost: 2500, border: "3px solid #a78bfa", shadow: "0 0 20px #a78bfacc", premium: false, className: "frame-rainbow" },
  { id: "premium",     name: "إطار بريميوم",          cost: 0,    border: "2px solid #f59e0b", shadow: "0 0 20px #f59e0b",    premium: true },
];

export const TITLES = [
  { id: "brave_knight",   name: "الفارس الشجاع",  cost: 150 },
  { id: "knowledge_lord", name: "سيد المعرفة",    cost: 200 },
  { id: "arena_legend",   name: "أسطورة الميدان", cost: 500 },
  { id: "leaders_leader", name: "قائد القادة",    cost: 800 },
];

export const POWER_CARD_ITEMS = [
  { id: "skip",       name: "تخطي سؤال",   icon: "⏭️", cost: 50  },
  { id: "extra_time", name: "وقت إضافي",   icon: "⏰", cost: 75  },
  { id: "remove_two", name: "حذف خيارين",  icon: "✂️", cost: 100 },
];

// ─── SEASON ───────────────────────────────────────────────────────────────────
export const SEASON_TIERS = [
  { name: "برونز",   min: 0,    coins: 50,   icon: "🥉", color: "#cd7f32" },
  { name: "فضة",    min: 100,  coins: 100,  icon: "🥈", color: "#9ca3af" },
  { name: "ذهب",    min: 300,  coins: 200,  icon: "🥇", color: "#f59e0b" },
  { name: "بلاتين", min: 700,  coins: 400,  icon: "💎", color: "#06b6d4" },
  { name: "أسطورة", min: 1500, coins: 1000, icon: "👑", color: "#8b5cf6" },
];

export function getSeasonTier(points: number) {
  let tier = SEASON_TIERS[0];
  for (const t of SEASON_TIERS) { if (points >= t.min) tier = t; }
  return tier;
}

export function getCurrentSeasonWeek(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function getDaysUntilSunday(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : 7 - day;
}

// ─── ACHIEVEMENTS DATA ────────────────────────────────────────────────────────
export interface AchievementsData {
  unlocked: string[];
  progress: Record<string, number | string[]>;
  avatar_frame: string | null;
  season_week: string;
  power_cards_store: Record<string, number>;
}

export function parseAchievementsData(raw: unknown): AchievementsData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { unlocked: [], progress: {}, avatar_frame: null, season_week: '', power_cards_store: {} };
  }
  const r = raw as Record<string, unknown>;
  return {
    unlocked:          Array.isArray(r.unlocked) ? r.unlocked as string[] : [],
    progress:          (r.progress as Record<string, number | string[]>) ?? {},
    avatar_frame:      (r.avatar_frame as string) ?? null,
    season_week:       (r.season_week as string) ?? '',
    power_cards_store: (r.power_cards_store as Record<string, number>) ?? {},
  };
}

export function getFrameStyle(frameId: string | null): { border: string; boxShadow: string } {
  const frame = FRAMES.find(f => f.id === frameId);
  return frame
    ? { border: frame.border, boxShadow: frame.shadow }
    : { border: '2px solid hsl(var(--primary))', boxShadow: 'none' };
}

export function getFrameClass(frameId: string | null): string {
  const frame = FRAMES.find(f => f.id === frameId);
  return frame?.className ?? '';
}

// ─── AWARD REWARDS ────────────────────────────────────────────────────────────
export interface AwardInput {
  userId: string;
  xp: number;
  coins: number;
  currentXP: number;
  currentCoins: number;
  currentLevel: number;
  currentAchievements: unknown;
  currentSeasonPoints: number;
  seasonDelta?: number;
  progressUpdates?: Record<string, number | string>;
  streakCount?: number;
}

export interface AwardResult {
  xpGained: number;
  coinsGained: number;
  newLevel: number;
  leveledUp: boolean;
  newlyUnlocked: string[];
  newXP: number;
  newCoins: number;
}

export async function awardGameRewards(input: AwardInput): Promise<AwardResult> {
  const {
    userId, xp, coins, currentXP, currentCoins, currentLevel,
    currentAchievements, currentSeasonPoints, seasonDelta = 0,
    progressUpdates = {}, streakCount,
  } = input;

  // First-game-of-day bonus: +15 coins, once per calendar day per device.
  let firstGameBonusCoins = 0;
  try {
    const FIRST_GAME_KEY = 'maydan_first_game_day';
    const today = new Date().toDateString();
    if (typeof localStorage !== 'undefined' && localStorage.getItem(FIRST_GAME_KEY) !== today) {
      localStorage.setItem(FIRST_GAME_KEY, today);
      firstGameBonusCoins = COIN_REWARDS.first_game_day;
    }
  } catch { /* ignore */ }

  const newXP    = currentXP    + xp;
  const newCoins = currentCoins + coins + firstGameBonusCoins;

  const calcLevel = (xpVal: number) => {
    let lv = 1;
    for (const lvl of LEVELS) { if (xpVal >= lvl.xp) lv = lvl.level; }
    return lv;
  };
  const newLevel = calcLevel(newXP);

  const aData = parseAchievementsData(currentAchievements);
  const progress = { ...aData.progress } as Record<string, number | string[]>;

  for (const [key, delta] of Object.entries(progressUpdates)) {
    if (key === 'categories_played') {
      const arr = Array.isArray(progress.categories_played)
        ? [...(progress.categories_played as string[])]
        : [];
      if (typeof delta === 'string' && !arr.includes(delta)) arr.push(delta);
      progress.categories_played = arr;
      progress.categories_count  = arr.length;
    } else {
      progress[key] = ((progress[key] as number) ?? 0) + (delta as number);
    }
  }
  if (streakCount !== undefined) progress.streak_count = streakCount;
  progress.level = newLevel;

  const newlyUnlocked: string[] = [];
  let bonusXP = 0, bonusCoins = 0;

  for (const ach of ACHIEVEMENTS) {
    if (aData.unlocked.includes(ach.id)) continue;
    const raw = progress[ach.progressKey];
    const val = Array.isArray(raw) ? (raw as string[]).length : ((raw as number) ?? 0);
    if (val >= ach.totalNeeded) {
      newlyUnlocked.push(ach.id);
      bonusXP    += ach.xp;
      bonusCoins += ach.coins;
    }
  }

  const finalXP    = newXP    + bonusXP;
  const finalCoins = newCoins + bonusCoins;
  const finalLevel = calcLevel(finalXP);

  const currentWeek = getCurrentSeasonWeek();
  const isNewSeason = aData.season_week !== currentWeek;
  const newSeasonPoints = isNewSeason
    ? seasonDelta
    : currentSeasonPoints + seasonDelta;

  const updatedAData: AchievementsData = {
    ...aData,
    unlocked: [...aData.unlocked, ...newlyUnlocked],
    progress,
    season_week: currentWeek,
  };

  await supabase.from('users').update({
    xp:            finalXP,
    coins:         finalCoins,
    level:         finalLevel,
    season_points: newSeasonPoints,
    achievements:  updatedAData,
  }).eq('id', userId);

  return {
    xpGained:      xp + bonusXP,
    coinsGained:   coins + bonusCoins + firstGameBonusCoins,
    newLevel:      finalLevel,
    leveledUp:     finalLevel > currentLevel,
    newlyUnlocked,
    newXP:         finalXP,
    newCoins:      finalCoins,
  };
}

// ─── PURCHASE ITEM ────────────────────────────────────────────────────────────
export async function purchaseItem(
  userId: string,
  itemType: 'frame' | 'title' | 'power_card',
  itemId: string,
  cost: number,
  currentCoins: number,
  currentAchievements: unknown,
): Promise<{ success: boolean; message: string; newCoins: number }> {
  if (currentCoins < cost) {
    return { success: false, message: 'رصيدك غير كافٍ 🪙', newCoins: currentCoins };
  }
  const aData  = parseAchievementsData(currentAchievements);
  const newCoins = currentCoins - cost;
  const update: Record<string, unknown> = { coins: newCoins };

  if (itemType === 'frame') {
    update.achievements = { ...aData, avatar_frame: itemId };
  } else if (itemType === 'title') {
    const t = TITLES.find(x => x.id === itemId);
    update.rank_title   = t?.name ?? itemId;
  } else {
    const store = { ...aData.power_cards_store };
    store[itemId] = (store[itemId] ?? 0) + 1;
    update.achievements = { ...aData, power_cards_store: store };
  }

  await supabase.from('users').update(update).eq('id', userId);
  return { success: true, message: 'تم الشراء بنجاح! ✅', newCoins };
}

// ─── SIMPLE HELPERS ───────────────────────────────────────────────────────────

export async function awardXP(userId: string, amount: number): Promise<number> {
  const { data } = await supabase.from('users').select('xp').eq('id', userId).single();
  const newXP = (data?.xp ?? 0) + amount;
  const newLevel = LEVELS.reduce((lv, lvl) => newXP >= lvl.xp ? lvl.level : lv, 1);
  await supabase.from('users').update({ xp: newXP, level: newLevel }).eq('id', userId);
  return newXP;
}

export async function awardCoins(userId: string, amount: number): Promise<number> {
  const { data } = await supabase.from('users').select('coins').eq('id', userId).single();
  const newCoins = (data?.coins ?? 0) + amount;
  await supabase.from('users').update({ coins: newCoins }).eq('id', userId);
  return newCoins;
}

export async function checkAchievements(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('xp, level, coins, achievements, season_points')
    .eq('id', userId)
    .single();
  if (!data) return [];
  const aData = parseAchievementsData(data.achievements);
  const progress: Record<string, number | string[]> = { ...aData.progress, level: data.level ?? 1 };
  const newlyUnlocked: string[] = [];
  let bonusXP = 0, bonusCoins = 0;
  for (const ach of ACHIEVEMENTS) {
    if (aData.unlocked.includes(ach.id)) continue;
    const raw = progress[ach.progressKey];
    const val = Array.isArray(raw) ? (raw as string[]).length : ((raw as number) ?? 0);
    if (val >= ach.totalNeeded) {
      newlyUnlocked.push(ach.id);
      bonusXP += ach.xp;
      bonusCoins += ach.coins;
    }
  }
  if (newlyUnlocked.length > 0) {
    const updatedAData = { ...aData, unlocked: [...aData.unlocked, ...newlyUnlocked] };
    const newXP    = (data.xp    ?? 0) + bonusXP;
    const newCoins = (data.coins ?? 0) + bonusCoins;
    const newLevel = LEVELS.reduce((lv, lvl) => newXP >= lvl.xp ? lvl.level : lv, 1);
    await supabase.from('users').update({
      achievements: updatedAData,
      xp: newXP, coins: newCoins, level: newLevel,
    }).eq('id', userId);
  }
  return newlyUnlocked;
}

// ─── SEASON RESET CHECK ───────────────────────────────────────────────────────
export async function checkSeasonReset(
  userId: string,
  currentAchievements: unknown,
  currentSeasonPoints: number,
  currentCoins: number,
): Promise<{ coinsAwarded: number; tierName: string } | null> {
  const aData = parseAchievementsData(currentAchievements);
  const currentWeek = getCurrentSeasonWeek();
  if (aData.season_week === currentWeek) return null;

  const tier = getSeasonTier(currentSeasonPoints);
  const newCoins = currentCoins + tier.coins;

  const updatedAData = { ...aData, season_week: currentWeek };
  await supabase.from('users').update({
    season_points: 0,
    coins:         newCoins,
    achievements:  updatedAData,
  }).eq('id', userId);

  return { coinsAwarded: tier.coins, tierName: tier.name };
}
