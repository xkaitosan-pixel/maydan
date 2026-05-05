export interface PowerCards {
  skipUsed: number;
  timeUsed: number;
  lastResetDate: string;
}

export interface CategoryStat {
  correct: number;
  total: number;
}

export interface UserStats {
  totalGames: number;
  survivalBest: number;
  survivalGames: number;
  challengeWins: number;
  categoryStats: Record<string, CategoryStat>;
}

export interface UserData {
  userId: string;
  displayName: string;
  challengesCreatedToday: number;
  lastChallengeDate: string;
  totalChallenges: number;
  wins: number;
  isPremium: boolean;
  // Streak
  streak: number;
  longestStreak: number;
  lastPlayedDate: string;
  // Stats
  stats: UserStats;
  // Power cards
  powerCards: PowerCards;
}

export interface ChallengeData {
  id: string;
  creatorId: string;
  creatorName: string;
  categoryId: string;
  questionCount: number;
  questions: number[];
  creatorAnswers: (number | null)[];
  creatorScore: number;
  creatorTime: number;
  challengerAnswers?: (number | null)[];
  challengerScore?: number;
  challengerTime?: number;
  challengerName?: string;
  createdAt: string;
  completedAt?: string;
  status: "waiting" | "completed";
}

const USER_KEY = "maydan_user";
const CHALLENGES_KEY = "maydan_challenges";
const FREE_CHALLENGE_LIMIT = 5;
const FREE_POWER_CARDS_PER_DAY = 2;

function defaultUser(): UserData {
  return {
    userId: generateId(),
    displayName: "",
    challengesCreatedToday: 0,
    lastChallengeDate: "",
    totalChallenges: 0,
    wins: 0,
    isPremium: false,
    streak: 0,
    longestStreak: 0,
    lastPlayedDate: "",
    stats: {
      totalGames: 0,
      survivalBest: 0,
      survivalGames: 0,
      challengeWins: 0,
      categoryStats: {},
    },
    powerCards: {
      skipUsed: 0,
      timeUsed: 0,
      lastResetDate: "",
    },
  };
}

export function getOrCreateUser(): UserData {
  const stored = localStorage.getItem(USER_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    // Migrate old users missing new fields
    const def = defaultUser();
    return {
      ...def,
      ...parsed,
      stats: { ...def.stats, ...(parsed.stats || {}) },
      powerCards: { ...def.powerCards, ...(parsed.powerCards || {}) },
    };
  }
  const user = defaultUser();
  saveUser(user);
  return user;
}

export function saveUser(user: UserData): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateDisplayName(name: string): UserData {
  const user = getOrCreateUser();
  user.displayName = name;
  saveUser(user);
  return user;
}

// ──────────────────────────── CHALLENGE LIMITS ────────────────────────────

export function canCreateChallenge(): boolean {
  const user = getOrCreateUser();
  if (user.isPremium) return true;
  const today = new Date().toDateString();
  if (user.lastChallengeDate !== today) return true;
  return user.challengesCreatedToday < FREE_CHALLENGE_LIMIT;
}

export function getRemainingChallenges(): number {
  const user = getOrCreateUser();
  if (user.isPremium) return Infinity;
  const today = new Date().toDateString();
  if (user.lastChallengeDate !== today) return FREE_CHALLENGE_LIMIT;
  return Math.max(0, FREE_CHALLENGE_LIMIT - user.challengesCreatedToday);
}

export function incrementChallengesCount(): void {
  const user = getOrCreateUser();
  const today = new Date().toDateString();
  if (user.lastChallengeDate !== today) {
    user.challengesCreatedToday = 1;
    user.lastChallengeDate = today;
  } else {
    user.challengesCreatedToday += 1;
  }
  user.totalChallenges += 1;
  saveUser(user);
}

// ──────────────────────────── STREAK ────────────────────────────

/** Call once per session (on home load). Returns milestone hit (3,7,30) or null */
export function updateStreak(): number | null {
  const user = getOrCreateUser();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (user.lastPlayedDate === today) return null; // already updated today

  let milestone: number | null = null;

  if (user.lastPlayedDate === yesterday) {
    user.streak += 1;
  } else {
    user.streak = 1; // reset or first play
  }

  user.lastPlayedDate = today;
  if (user.streak > user.longestStreak) user.longestStreak = user.streak;

  // Check milestones
  if ([3, 7, 30].includes(user.streak)) milestone = user.streak;

  saveUser(user);
  return milestone;
}

// ──────────────────────────── POWER CARDS ────────────────────────────

function resetPowerCardsIfNeeded(user: UserData): UserData {
  const today = new Date().toDateString();
  if (user.powerCards.lastResetDate !== today) {
    user.powerCards = { skipUsed: 0, timeUsed: 0, lastResetDate: today };
  }
  return user;
}

export function getAvailablePowerCards(): { skip: number; time: number } {
  let user = getOrCreateUser();
  user = resetPowerCardsIfNeeded(user);
  if (user.isPremium) return { skip: Infinity, time: Infinity };
  return {
    skip: Math.max(0, FREE_POWER_CARDS_PER_DAY - user.powerCards.skipUsed),
    time: Math.max(0, FREE_POWER_CARDS_PER_DAY - user.powerCards.timeUsed),
  };
}

export function useSkipCard(): boolean {
  let user = getOrCreateUser();
  user = resetPowerCardsIfNeeded(user);
  if (!user.isPremium && user.powerCards.skipUsed >= FREE_POWER_CARDS_PER_DAY) return false;
  user.powerCards.skipUsed += 1;
  saveUser(user);
  return true;
}

export function useTimeCard(): boolean {
  let user = getOrCreateUser();
  user = resetPowerCardsIfNeeded(user);
  if (!user.isPremium && user.powerCards.timeUsed >= FREE_POWER_CARDS_PER_DAY) return false;
  user.powerCards.timeUsed += 1;
  saveUser(user);
  return true;
}

// ──────────────────────────── STATS ────────────────────────────

export function recordGamePlayed(): void {
  const user = getOrCreateUser();
  user.stats.totalGames += 1;
  saveUser(user);
}

export function recordWin(): void {
  const user = getOrCreateUser();
  user.wins += 1;
  user.stats.challengeWins += 1;
  saveUser(user);
}

export function recordSurvivalGame(score: number): void {
  const user = getOrCreateUser();
  user.stats.survivalGames += 1;
  user.stats.totalGames += 1;
  if (score > user.stats.survivalBest) user.stats.survivalBest = score;
  saveUser(user);
}

export function recordCategoryAnswers(categoryId: string, correct: number, total: number): void {
  const user = getOrCreateUser();
  const existing = user.stats.categoryStats[categoryId] || { correct: 0, total: 0 };
  user.stats.categoryStats[categoryId] = {
    correct: existing.correct + correct,
    total: existing.total + total,
  };
  saveUser(user);
}

// ──────────────────────────── CHALLENGES ────────────────────────────

export function saveChallenge(challenge: ChallengeData): void {
  const challenges = getChallenges();
  challenges[challenge.id] = challenge;
  localStorage.setItem(CHALLENGES_KEY, JSON.stringify(challenges));
}

export function getChallenge(id: string): ChallengeData | null {
  return getChallenges()[id] || null;
}

export function getChallenges(): Record<string, ChallengeData> {
  const stored = localStorage.getItem(CHALLENGES_KEY);
  if (!stored) return {};
  return JSON.parse(stored);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ──────────────────────────── RANK ────────────────────────────

export interface Rank {
  title: string;
  icon: string;
  color: string;
}

export function getSurvivalRank(score: number): Rank {
  if (score >= 31) return { title: "أسطورة", icon: "👑", color: "#eab308" };
  if (score >= 16) return { title: "بطل", icon: "🥇", color: "#f59e0b" };
  if (score >= 6)  return { title: "محارب", icon: "⚔️", color: "#a78bfa" };
  return { title: "مبتدئ", icon: "🥉", color: "#94a3b8" };
}

// ──────────────────────────── ROOMS (pass-and-play) ────────────────────────────

const ROOMS_KEY = "maydan_rooms";

export interface RoomPlayer {
  name: string;
  score: number;
  answers: (number | null)[];
  timeMs: number;
}

export interface RoomData {
  code: string;
  categoryId: string;
  questionCount: number;
  questions: number[];
  players: RoomPlayer[];
  status: "waiting" | "playing" | "done";
  hostName: string;
  createdAt: string;
}

function getRooms(): Record<string, RoomData> {
  const s = localStorage.getItem(ROOMS_KEY);
  return s ? JSON.parse(s) : {};
}

export function saveRoom(room: RoomData): void {
  const rooms = getRooms();
  rooms[room.code] = room;
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
}

export function getRoom(code: string): RoomData | null {
  return getRooms()[code] || null;
}

export function generateRoomCode(): string {
  const nums = Math.floor(1000 + Math.random() * 9000);
  return `ميدان-${nums}`;
}

// ──────────────────────────── NOTIFICATIONS ────────────────────────────

export interface AppNotification {
  id: string;
  type: "streak_danger" | "pending_challenge";
  message: string;
  icon: string;
  cta?: string;
  ctaRoute?: string;
  color: string;
}

// ──────────────────────────── ONBOARDING ────────────────────────────

const ONBOARDED_KEY = "maydan_onboarded";

export function hasCompletedOnboarding(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

export function markOnboardingComplete(): void {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

// ──────────────────────────── PREMIUM ────────────────────────────

export function activatePremium(): void {
  const user = getOrCreateUser();
  user.isPremium = true;
  saveUser(user);
}

export function deactivatePremium(): void {
  const user = getOrCreateUser();
  user.isPremium = false;
  saveUser(user);
}

// ──────────────────────────── LEADERBOARD ────────────────────────────

const LEADERBOARD_KEY = "maydan_leaderboard";

export interface LeaderboardEntry {
  name: string;
  score: number;
  total: number;
  category: string;
  type: "survival" | "challenge" | "room" | "tournament";
  date: number;
  week: string;
}

function getWeekKey(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
  return `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}-${d.getMonth()}`;
}

export function getLeaderboard(): LeaderboardEntry[] {
  const s = localStorage.getItem(LEADERBOARD_KEY);
  return s ? JSON.parse(s) : [];
}

export function addLeaderboardEntry(entry: Omit<LeaderboardEntry, "date" | "week">): void {
  const entries = getLeaderboard();
  entries.push({ ...entry, date: Date.now(), week: getWeekKey() });
  // Keep max 500 entries
  if (entries.length > 500) entries.splice(0, entries.length - 500);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

export function getWeeklyTop(category?: string): LeaderboardEntry[] {
  const week = getWeekKey();
  return getLeaderboard()
    .filter(e => e.week === week && (!category || category === "all" || e.category === category))
    .sort((a, b) => b.score - a.score || a.total - b.total)
    .slice(0, 10);
}

export function getAllTimeTop(category?: string): LeaderboardEntry[] {
  return getLeaderboard()
    .filter(e => !category || category === "all" || e.category === category)
    .sort((a, b) => b.score - a.score || a.total - b.total)
    .slice(0, 10);
}

export function getMyRank(name: string, weekly: boolean): number {
  const list = weekly ? getWeeklyTop() : getAllTimeTop();
  const idx = list.findIndex(e => e.name === name);
  return idx === -1 ? -1 : idx + 1;
}

export function getActiveNotifications(): AppNotification[] {
  const user = getOrCreateUser();
  const today = new Date().toDateString();
  const notes: AppNotification[] = [];

  if (user.streak > 0 && user.lastPlayedDate !== today) {
    notes.push({
      id: "streak_danger",
      type: "streak_danger",
      message: `🔥 ستريكك (${user.streak} يوم) في خطر! العب الآن`,
      icon: "⚠️",
      color: "#dc2626",
    });
  }

  const challenges = getChallenges();
  const pendingForMe = Object.values(challenges).filter(
    c => c.status === "waiting" && c.creatorId !== user.userId
  );
  if (pendingForMe.length > 0) {
    notes.push({
      id: "pending_challenge",
      type: "pending_challenge",
      message: `تحداك ${pendingForMe[0].creatorName} في الميدان ⚔️`,
      icon: "⚔️",
      cta: "العب",
      ctaRoute: `/challenge/${pendingForMe[0].id}`,
      color: "#7c3aed",
    });
  }

  return notes;
}
