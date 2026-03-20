export interface UserData {
  userId: string;
  displayName: string;
  challengesCreatedToday: number;
  lastChallengeDate: string;
  totalChallenges: number;
  wins: number;
  isPremium: boolean;
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
  status: 'waiting' | 'completed';
}

const USER_KEY = 'maydan_user';
const CHALLENGES_KEY = 'maydan_challenges';
const FREE_LIMIT = 5;

export function getOrCreateUser(): UserData {
  const stored = localStorage.getItem(USER_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  const user: UserData = {
    userId: generateId(),
    displayName: '',
    challengesCreatedToday: 0,
    lastChallengeDate: '',
    totalChallenges: 0,
    wins: 0,
    isPremium: false
  };
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

export function canCreateChallenge(): boolean {
  const user = getOrCreateUser();
  if (user.isPremium) return true;
  const today = new Date().toDateString();
  if (user.lastChallengeDate !== today) return true;
  return user.challengesCreatedToday < FREE_LIMIT;
}

export function getRemainingChallenges(): number {
  const user = getOrCreateUser();
  if (user.isPremium) return Infinity;
  const today = new Date().toDateString();
  if (user.lastChallengeDate !== today) return FREE_LIMIT;
  return Math.max(0, FREE_LIMIT - user.challengesCreatedToday);
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

export function saveChallenge(challenge: ChallengeData): void {
  const challenges = getChallenges();
  challenges[challenge.id] = challenge;
  localStorage.setItem(CHALLENGES_KEY, JSON.stringify(challenges));
}

export function getChallenge(id: string): ChallengeData | null {
  const challenges = getChallenges();
  return challenges[id] || null;
}

export function getChallenges(): Record<string, ChallengeData> {
  const stored = localStorage.getItem(CHALLENGES_KEY);
  if (!stored) return {};
  return JSON.parse(stored);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function recordWin(): void {
  const user = getOrCreateUser();
  user.wins += 1;
  saveUser(user);
}
