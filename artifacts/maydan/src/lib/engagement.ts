// ─── ENGAGEMENT & RETENTION ───────────────────────────────────────────────────
// Daily missions, weekly challenge, daily-login streak, reward boxes and
// per-category levels. All state for a logged-in user lives inside
// `users.achievements.engagement` (a JSONB passthrough preserved by
// parseAchievementsData). Guests have no DB row / coins, so engagement — like
// seasons and achievements — is gated to authenticated users.
//
// Every mutation does its own fresh read-modify-write of the user row so it
// never clobbers concurrent award writes (which only touch sibling keys).

import { supabase } from "./supabase";
import { parseAchievementsData } from "./gamification";
import { CATEGORIES, getCategoryById } from "./questions";

// ─── DEFINITIONS ──────────────────────────────────────────────────────────────

export type MissionField = "games" | "wins" | "correct";

export interface MissionDef {
  id: string;
  icon: string;
  label: string;
  target: number;
  field: MissionField;
  reward: number; // coins
}

export const DAILY_MISSIONS: MissionDef[] = [
  { id: "play3",     icon: "🎮", label: "العب 3 ألعاب",        target: 3,  field: "games",   reward: 20 },
  { id: "win1",      icon: "🏆", label: "فز بتحدٍ واحد",        target: 1,  field: "wins",    reward: 30 },
  { id: "correct10", icon: "✅", label: "أجب 10 أسئلة صحيحة",   target: 10, field: "correct", reward: 15 },
];

export const WEEKLY_CHALLENGE = {
  id: "answer100",
  icon: "🎯",
  label: "أجب 100 سؤال صحيح هذا الأسبوع",
  target: 100,
  reward: 200, // coins
  badge: "weekly_warrior",
};

// Escalating reward for login days 1..7, then the cycle repeats.
export const LOGIN_REWARDS = [10, 15, 20, 25, 30, 40, 100];

export const REWARD_BOX_EVERY = 5;       // a box every 5 games
export const CATEGORY_MASTERY_LEVEL = 10; // mastery badge at level 10
export const CATEGORY_XP_PER_CORRECT = 10;

// ─── STATE SHAPE ────────────────────────────────────────────────────────────--

export interface EngagementState {
  daily:   { date: string;  games: number; wins: number; correct: number; claimed: string[] };
  weekly:  { week: string;  correct: number; claimed: boolean };
  login:   { streak: number; lastDate: string; claimedDate: string };
  box:     { gamesSince: number; pending: number };
  categories: Record<string, { xp: number }>;
  mastery: string[]; // category ids that reached mastery (badge granted once)
}

function emptyState(): EngagementState {
  return {
    daily:   { date: "", games: 0, wins: 0, correct: 0, claimed: [] },
    weekly:  { week: "", correct: 0, claimed: false },
    login:   { streak: 0, lastDate: "", claimedDate: "" },
    box:     { gamesSince: 0, pending: 0 },
    categories: {},
    mastery: [],
  };
}

// ─── DATE / WEEK HELPERS ───────────────────────────────────────────────────────

/** Local calendar day key, e.g. "2026-06-21". Day resets at local midnight. */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayKey(d: Date = new Date()): string {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return todayKey(y);
}

/** Monday-based week key, e.g. "2026-W25". Weekly challenge resets Monday. */
export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // ISO week: Thursday determines the year.
  const day = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ─── NORMALIZE (applies daily/weekly rollovers) ────────────────────────────────

export function normalizeEngagement(raw: unknown, now: Date = new Date()): EngagementState {
  const base = emptyState();
  const s: EngagementState = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? { ...base, ...(raw as Partial<EngagementState>) }
    : base;
  // Deep-merge the nested objects so partial/legacy blobs don't crash.
  s.daily   = { ...base.daily,   ...(s.daily   ?? {}) };
  s.weekly  = { ...base.weekly,  ...(s.weekly  ?? {}) };
  s.login   = { ...base.login,   ...(s.login   ?? {}) };
  s.box     = { ...base.box,     ...(s.box     ?? {}) };
  s.categories = s.categories && typeof s.categories === "object" ? s.categories : {};
  s.mastery = Array.isArray(s.mastery) ? s.mastery : [];

  const tKey = todayKey(now);
  const wKey = weekKey(now);

  if (s.daily.date !== tKey) {
    s.daily = { date: tKey, games: 0, wins: 0, correct: 0, claimed: [] };
  }
  if (s.weekly.week !== wKey) {
    s.weekly = { week: wKey, correct: 0, claimed: false };
  }
  return s;
}

/** Extract + normalize engagement state from a raw `users.achievements` blob. */
export function engagementFrom(rawAchievements: unknown, now: Date = new Date()): EngagementState {
  return normalizeEngagement(parseAchievementsData(rawAchievements).engagement, now);
}

// ─── CATEGORY LEVEL MATH ───────────────────────────────────────────────────────
// Each level L requires L*100 XP to advance to L+1 (cumulative).

export interface CatLevel {
  level: number;
  intoLevel: number; // xp accumulated into the current level
  needed: number;    // xp needed to finish the current level
  xp: number;        // total xp
  mastered: boolean;
}

export function catLevelFromXp(xp: number): CatLevel {
  let level = 1;
  let rem = Math.max(0, Math.floor(xp));
  while (rem >= level * 100) { rem -= level * 100; level++; }
  return { level, intoLevel: rem, needed: level * 100, xp: Math.max(0, Math.floor(xp)), mastered: level >= CATEGORY_MASTERY_LEVEL };
}

export function getCategoryLevel(state: EngagementState, catId: string): CatLevel {
  return catLevelFromXp(state.categories[catId]?.xp ?? 0);
}

// ─── DB I/O ────────────────────────────────────────────────────────────────────

interface UserRow {
  achievements: unknown;
  coins: number | null;
}

async function readUser(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("achievements, coins")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data as UserRow;
}

/** Write back engagement (and optionally coins) preserving all sibling keys. */
async function writeUser(userId: string, rawAchievements: unknown, engagement: EngagementState, coins?: number): Promise<boolean> {
  const a = parseAchievementsData(rawAchievements);
  const update: Record<string, unknown> = { achievements: { ...a, engagement } };
  if (typeof coins === "number") update.coins = coins;
  const { error } = await supabase.from("users").update(update).eq("id", userId);
  return !error;
}

// ─── GAME-END TRACKING ─────────────────────────────────────────────────────────

export interface GameMeta {
  won: boolean;
  correct: number;     // number of correct answers in this game
  categoryId?: string; // single category (survival / daily); omit for mixed
}

export interface GameTrackResult {
  boxesPending: number;
  newBox: boolean;
  missionsJustCompleted: MissionDef[];
  weeklyJustCompleted: boolean;
  categoryLevelUp: { catId: string; name: string; level: number } | null;
  masteryUnlocked: { catId: string; name: string } | null;
}

const NO_RESULT: GameTrackResult = {
  boxesPending: 0, newBox: false, missionsJustCompleted: [],
  weeklyJustCompleted: false, categoryLevelUp: null, masteryUnlocked: null,
};

export async function recordEngagementGame(userId: string, meta: GameMeta): Promise<GameTrackResult> {
  const row = await readUser(userId);
  if (!row) return NO_RESULT;
  const s = engagementFrom(row.achievements);
  const correct = Math.max(0, Math.floor(meta.correct || 0));

  // Snapshot mission completion BEFORE applying this game.
  const wasComplete = (m: MissionDef) => s.daily[m.field] >= m.target;
  const beforeComplete = DAILY_MISSIONS.map(wasComplete);
  const weeklyBefore = s.weekly.correct >= WEEKLY_CHALLENGE.target;

  // Daily missions progress.
  s.daily.games += 1;
  if (meta.won) s.daily.wins += 1;
  s.daily.correct += correct;

  // Weekly challenge progress.
  s.weekly.correct += correct;

  // Reward boxes.
  let newBox = false;
  s.box.gamesSince += 1;
  while (s.box.gamesSince >= REWARD_BOX_EVERY) {
    s.box.gamesSince -= REWARD_BOX_EVERY;
    s.box.pending += 1;
    newBox = true;
  }

  // Category levels.
  let categoryLevelUp: GameTrackResult["categoryLevelUp"] = null;
  let masteryUnlocked: GameTrackResult["masteryUnlocked"] = null;
  if (meta.categoryId && correct > 0) {
    const cat = meta.categoryId;
    const prev = catLevelFromXp(s.categories[cat]?.xp ?? 0);
    const nextXp = (s.categories[cat]?.xp ?? 0) + correct * CATEGORY_XP_PER_CORRECT;
    s.categories[cat] = { xp: nextXp };
    const next = catLevelFromXp(nextXp);
    const name = getCategoryById(cat)?.name ?? cat;
    if (next.level > prev.level) categoryLevelUp = { catId: cat, name, level: next.level };
    if (next.mastered && !s.mastery.includes(cat)) {
      s.mastery.push(cat);
      masteryUnlocked = { catId: cat, name };
    }
  }

  const missionsJustCompleted = DAILY_MISSIONS.filter((m, i) => !beforeComplete[i] && s.daily[m.field] >= m.target);
  const weeklyJustCompleted = !weeklyBefore && s.weekly.correct >= WEEKLY_CHALLENGE.target;

  await writeUser(userId, row.achievements, s);

  return {
    boxesPending: s.box.pending,
    newBox,
    missionsJustCompleted,
    weeklyJustCompleted,
    categoryLevelUp,
    masteryUnlocked,
  };
}

// ─── CLAIMS ────────────────────────────────────────────────────────────────────

export interface ClaimResult { ok: boolean; coins: number; newCoins: number; reason?: string }

export async function claimMission(userId: string, missionId: string): Promise<ClaimResult> {
  const def = DAILY_MISSIONS.find(m => m.id === missionId);
  if (!def) return { ok: false, coins: 0, newCoins: 0, reason: "unknown" };
  const row = await readUser(userId);
  if (!row) return { ok: false, coins: 0, newCoins: 0, reason: "no_user" };
  const s = engagementFrom(row.achievements);
  if (s.daily.claimed.includes(missionId)) return { ok: false, coins: 0, newCoins: row.coins ?? 0, reason: "claimed" };
  if (s.daily[def.field] < def.target) return { ok: false, coins: 0, newCoins: row.coins ?? 0, reason: "incomplete" };
  s.daily.claimed.push(missionId);
  const newCoins = (row.coins ?? 0) + def.reward;
  const ok = await writeUser(userId, row.achievements, s, newCoins);
  return { ok, coins: def.reward, newCoins, reason: ok ? undefined : "write_failed" };
}

export async function claimWeekly(userId: string): Promise<ClaimResult> {
  const row = await readUser(userId);
  if (!row) return { ok: false, coins: 0, newCoins: 0, reason: "no_user" };
  const s = engagementFrom(row.achievements);
  if (s.weekly.claimed) return { ok: false, coins: 0, newCoins: row.coins ?? 0, reason: "claimed" };
  if (s.weekly.correct < WEEKLY_CHALLENGE.target) return { ok: false, coins: 0, newCoins: row.coins ?? 0, reason: "incomplete" };
  s.weekly.claimed = true;
  const newCoins = (row.coins ?? 0) + WEEKLY_CHALLENGE.reward;
  const ok = await writeUser(userId, row.achievements, s, newCoins);
  return { ok, coins: WEEKLY_CHALLENGE.reward, newCoins, reason: ok ? undefined : "write_failed" };
}

// ─── REWARD BOX ────────────────────────────────────────────────────────────────

export type RewardKind = "coins" | "xp" | "frame";

export interface BoxReward {
  kind: RewardKind;
  amount: number;     // coins or xp
  frameId?: string;
  label: string;
  icon: string;
  rarity: "common" | "rare" | "epic";
}

function rollBoxReward(): BoxReward {
  const r = Math.random();
  if (r < 0.45) {
    const amount = 10 + Math.floor(Math.random() * 41); // 10-50
    return { kind: "coins", amount, label: `${amount} قرش`, icon: "🪙", rarity: "common" };
  }
  if (r < 0.75) {
    const amount = 50 + Math.floor(Math.random() * 51); // 50-100
    return { kind: "coins", amount, label: `${amount} قرش`, icon: "💰", rarity: "rare" };
  }
  if (r < 0.95) {
    const amount = 50 + Math.floor(Math.random() * 51); // 50-100 XP
    return { kind: "xp", amount, label: `${amount} نقطة خبرة`, icon: "⭐", rarity: "rare" };
  }
  return { kind: "frame", amount: 0, frameId: "gold", label: "إطار ذهبي نادر", icon: "🖼️", rarity: "epic" };
}

export interface OpenBoxResult { ok: boolean; reward: BoxReward | null; newCoins: number; pending: number; reason?: string }

export async function openRewardBox(userId: string): Promise<OpenBoxResult> {
  const row = await readUser(userId);
  if (!row) return { ok: false, reward: null, newCoins: 0, pending: 0, reason: "no_user" };
  const s = engagementFrom(row.achievements);
  if (s.box.pending <= 0) return { ok: false, reward: null, newCoins: row.coins ?? 0, pending: 0, reason: "empty" };

  const reward = rollBoxReward();
  s.box.pending -= 1;

  const a = parseAchievementsData(row.achievements);
  const update: Record<string, unknown> = {};
  let newCoins = row.coins ?? 0;

  if (reward.kind === "coins") {
    newCoins += reward.amount;
    update.coins = newCoins;
  } else if (reward.kind === "xp") {
    // XP is stored on the user row; bump it directly.
    const { data } = await supabase.from("users").select("xp").eq("id", userId).single();
    const curXp = (data?.xp as number) ?? 0;
    update.xp = curXp + reward.amount;
  } else if (reward.kind === "frame" && reward.frameId) {
    a.avatar_frame = reward.frameId;
  }

  update.achievements = { ...a, engagement: s };
  const { error } = await supabase.from("users").update(update).eq("id", userId);
  if (error) return { ok: false, reward: null, newCoins: row.coins ?? 0, pending: s.box.pending + 1, reason: "write_failed" };
  return { ok: true, reward, newCoins, pending: s.box.pending };
}

// ─── DAILY LOGIN STREAK ────────────────────────────────────────────────────────

export interface LoginInfo {
  streak: number;       // total consecutive login days
  dayInCycle: number;   // 1..7
  reward: number;       // today's reward
  canClaim: boolean;    // not yet claimed today
}

function loginInfoFrom(s: EngagementState, now: Date): LoginInfo {
  const streak = Math.max(1, s.login.streak);
  const dayInCycle = ((streak - 1) % 7) + 1;
  return {
    streak,
    dayInCycle,
    reward: LOGIN_REWARDS[dayInCycle - 1],
    canClaim: s.login.claimedDate !== todayKey(now),
  };
}

/** Call once on home load. Advances/resets the login streak for today. */
export async function refreshLoginStreak(userId: string, now: Date = new Date()): Promise<LoginInfo | null> {
  const row = await readUser(userId);
  if (!row) return null;
  const s = engagementFrom(row.achievements, now);
  const tKey = todayKey(now);

  if (s.login.lastDate !== tKey) {
    if (s.login.lastDate === yesterdayKey(now)) s.login.streak = Math.max(1, s.login.streak) + 1;
    else s.login.streak = 1;
    s.login.lastDate = tKey;
    await writeUser(userId, row.achievements, s);
  }
  return loginInfoFrom(s, now);
}

export async function claimLoginReward(userId: string, now: Date = new Date()): Promise<ClaimResult & { dayInCycle: number }> {
  const row = await readUser(userId);
  if (!row) return { ok: false, coins: 0, newCoins: 0, reason: "no_user", dayInCycle: 1 };
  const s = engagementFrom(row.achievements, now);
  const tKey = todayKey(now);
  const info = loginInfoFrom(s, now);
  if (s.login.claimedDate === tKey) return { ok: false, coins: 0, newCoins: row.coins ?? 0, reason: "claimed", dayInCycle: info.dayInCycle };
  s.login.claimedDate = tKey;
  const newCoins = (row.coins ?? 0) + info.reward;
  const ok = await writeUser(userId, row.achievements, s, newCoins);
  return { ok, coins: info.reward, newCoins, reason: ok ? undefined : "write_failed", dayInCycle: info.dayInCycle };
}

// ─── SELECTORS (pure, for rendering) ───────────────────────────────────────────

export interface MissionView extends MissionDef { current: number; complete: boolean; claimed: boolean; }

export function getMissionViews(state: EngagementState): MissionView[] {
  return DAILY_MISSIONS.map(m => {
    const current = Math.min(state.daily[m.field], m.target);
    return { ...m, current, complete: state.daily[m.field] >= m.target, claimed: state.daily.claimed.includes(m.id) };
  });
}

export interface WeeklyView { current: number; target: number; complete: boolean; claimed: boolean; reward: number; }

export function getWeeklyView(state: EngagementState): WeeklyView {
  return {
    current: Math.min(state.weekly.correct, WEEKLY_CHALLENGE.target),
    target: WEEKLY_CHALLENGE.target,
    complete: state.weekly.correct >= WEEKLY_CHALLENGE.target,
    claimed: state.weekly.claimed,
    reward: WEEKLY_CHALLENGE.reward,
  };
}

export function getLoginInfo(state: EngagementState, now: Date = new Date()): LoginInfo {
  return loginInfoFrom(state, now);
}

export interface CategoryLevelView { id: string; name: string; icon: string; level: CatLevel; }

export function getAllCategoryLevels(state: EngagementState): CategoryLevelView[] {
  return CATEGORIES.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    level: catLevelFromXp(state.categories[c.id]?.xp ?? 0),
  }));
}

// ─── NEAR-MISS MOTIVATION ──────────────────────────────────────────────────────

export interface MotivationOpts {
  state: EngagementState;
  level?: number;
  xpIntoLevel?: number;
  xpForLevel?: number;
  playStreak?: number;
  weeklyRank?: number | null;
}

export interface MotivationMsg { icon: string; text: string; }

export function getMotivationMessages(opts: MotivationOpts): MotivationMsg[] {
  const msgs: MotivationMsg[] = [];

  // Close to next level.
  if (opts.xpForLevel && opts.xpIntoLevel !== undefined) {
    const remaining = opts.xpForLevel - opts.xpIntoLevel;
    if (remaining > 0 && remaining <= 30) {
      msgs.push({ icon: "⚡", text: `${remaining} نقطة خبرة فقط للمستوى التالي!` });
    }
  }

  // Almost done with the day's missions.
  const incomplete = DAILY_MISSIONS.filter(m => opts.state.daily[m.field] < m.target);
  if (incomplete.length === 1) {
    const m = incomplete[0];
    const left = m.target - opts.state.daily[m.field];
    msgs.push({ icon: m.icon, text: `باقي ${left} فقط لإكمال مهمة "${m.label}"!` });
  }

  // Weekly challenge near completion.
  const wRemaining = WEEKLY_CHALLENGE.target - opts.state.weekly.correct;
  if (wRemaining > 0 && wRemaining <= 15 && !opts.state.weekly.claimed) {
    msgs.push({ icon: "🎯", text: `باقي ${wRemaining} إجابة صحيحة لإنهاء تحدي الأسبوع!` });
  }

  // Reward box almost ready.
  const boxLeft = REWARD_BOX_EVERY - opts.state.box.gamesSince;
  if (opts.state.box.pending === 0 && boxLeft > 0 && boxLeft <= 2) {
    msgs.push({ icon: "🎁", text: `لعبة${boxLeft === 1 ? "" : "تان"} أخرى وتفتح صندوق مكافأة!` });
  }

  // Play streak at risk.
  if (opts.playStreak && opts.playStreak >= 2) {
    msgs.push({ icon: "🔥", text: `سلسلتك ${opts.playStreak} أيام — لا تكسرها اليوم!` });
  }

  // Leaderboard near-miss.
  if (opts.weeklyRank && opts.weeklyRank >= 2 && opts.weeklyRank <= 50) {
    msgs.push({ icon: "🏆", text: `أنت قريب من المركز #${opts.weeklyRank - 1} — تقدّم خطوة!` });
  }

  return msgs;
}
