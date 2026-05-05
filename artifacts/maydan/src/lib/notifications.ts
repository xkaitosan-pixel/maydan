import { supabase } from "./supabase";
import type { DbUser } from "./AuthContext";

export type NotifType =
  | "streak_danger"
  | "daily_challenge"
  | "rank_dropped"
  | "achievement"
  | "challenge_completed"
  | "challenge_reminder";

export const NOTIF_TYPES: Array<{ type: NotifType; icon: string; label: string; desc: string }> = [
  { type: "streak_danger", icon: "🔥", label: "تنبيه الستريك", desc: "تذكير قبل خسارة ستريكك اليومي" },
  { type: "daily_challenge", icon: "📅", label: "تحدي اليوم", desc: "تذكير بتحدي اليوم إذا لم تلعبه" },
  { type: "rank_dropped", icon: "⚔️", label: "تغيّر ترتيبك", desc: "تنبيه عند تجاوزك في لوحة المتصدرين" },
  { type: "achievement", icon: "🏅", label: "إنجازات جديدة", desc: "إشعار عند فتح إنجاز" },
  { type: "challenge_completed", icon: "🎯", label: "إكمال تحدياتك", desc: "إشعار عندما يُنهي خصمك تحديك" },
  { type: "challenge_reminder", icon: "⏳", label: "تذكير التحديات", desc: "تذكير إذا لم يلعب خصمك بعد ٢٤ ساعة" },
];

const PREFS_KEY = "maydan_notif_prefs";

export function getNotifPrefs(): Record<NotifType, boolean> {
  const defaults: Record<NotifType, boolean> = {
    streak_danger: true,
    daily_challenge: true,
    rank_dropped: true,
    achievement: true,
    challenge_completed: true,
    challenge_reminder: true,
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function setNotifPref(type: NotifType, enabled: boolean) {
  try {
    const prev = getNotifPrefs();
    const next = { ...prev, [type]: enabled };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function isEnabled(type: NotifType): boolean {
  return getNotifPrefs()[type] !== false;
}

export interface AppNotif {
  id: string;
  type: NotifType;
  icon: string;
  title: string;
  ctaRoute?: string;
  autoDismissMs?: number;
}

const SESSION_PREFIX = "maydan_notif_session:";
const PERSIST_PREFIX = "maydan_notif_persist:";
const RANK_KEY_PREFIX = "maydan_last_rank:";

/* ─────── per-session dedup (cleared on tab close) ─────── */
function sessionSeen(type: NotifType): boolean {
  try {
    return sessionStorage.getItem(SESSION_PREFIX + type) === "1";
  } catch {
    return false;
  }
}
function markSessionSeen(type: NotifType) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + type, "1");
  } catch {
    /* ignore */
  }
}

/* ─────── per-day dedup (avoid spamming same notice repeatedly) ─────── */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function persistedSeenToday(type: NotifType): boolean {
  try {
    return localStorage.getItem(PERSIST_PREFIX + type) === todayKey();
  } catch {
    return false;
  }
}
function markPersistedSeenToday(type: NotifType) {
  try {
    localStorage.setItem(PERSIST_PREFIX + type, todayKey());
  } catch {
    /* ignore */
  }
}

/* ─────── individual producers ─────── */

function checkStreakDanger(dbUser: DbUser | null): AppNotif | null {
  if (!dbUser) return null;
  const hour = new Date().getHours();
  if (hour < 20) return null;
  const lastPlayed = dbUser.last_played
    ? new Date(dbUser.last_played).toISOString().slice(0, 10)
    : null;
  if (lastPlayed === todayKey()) return null;
  if ((dbUser.streak_count ?? 0) <= 0) return null;
  return {
    id: "streak_danger_" + todayKey(),
    type: "streak_danger",
    icon: "🔥",
    title: "ستريكك في خطر! العب الآن قبل منتصف الليل",
    ctaRoute: "/",
    autoDismissMs: 6000,
  };
}

async function checkDailyChallenge(dbUser: DbUser | null): Promise<AppNotif | null> {
  if (!dbUser?.id) return null;
  const today = todayKey();
  try {
    // Count today's participants and check if user has played
    const [{ count: total }, { data: mine }] = await Promise.all([
      supabase
        .from("daily_scores")
        .select("id", { count: "exact", head: true })
        .eq("date", today),
      supabase
        .from("daily_scores")
        .select("id")
        .eq("date", today)
        .eq("user_id", dbUser.id)
        .maybeSingle(),
    ]);
    if (mine) return null; // already completed
    const playerWord = total && total > 0 ? `${total} لاعب أكمله` : "ابدأ الآن";
    return {
      id: "daily_" + today,
      type: "daily_challenge",
      icon: "📅",
      title: `تحدي اليوم بانتظارك! ${playerWord}`,
      ctaRoute: "/daily",
      autoDismissMs: 6000,
    };
  } catch (e) {
    console.warn("[notifications] daily check failed", e);
    return null;
  }
}

async function checkRankDropped(dbUser: DbUser | null): Promise<AppNotif | null> {
  if (!dbUser?.id) return null;
  try {
    // Compute current rank by season_points (top 100 cutoff)
    const { data: top, error } = await supabase
      .from("users")
      .select("id, season_points")
      .order("season_points", { ascending: false })
      .limit(100);
    if (error || !top) return null;
    const myIdx = top.findIndex((u) => u.id === dbUser.id);
    const currentRank = myIdx === -1 ? 999 : myIdx + 1;
    const key = RANK_KEY_PREFIX + dbUser.id;
    const prevStr = localStorage.getItem(key);
    const prevRank = prevStr ? parseInt(prevStr, 10) : null;
    // Always update stored rank for next comparison
    localStorage.setItem(key, String(currentRank));
    if (prevRank == null) return null; // first run, no comparison
    if (currentRank > prevRank) {
      return {
        id: "rank_dropped_" + todayKey(),
        type: "rank_dropped",
        icon: "⚔️",
        title: "شخص تجاوزك في لوحة المتصدرين!",
        ctaRoute: "/leaderboard",
        autoDismissMs: 6000,
      };
    }
    return null;
  } catch (e) {
    console.warn("[notifications] rank check failed", e);
    return null;
  }
}

/* ─────── challenge completion (per-id dedup, not per-type) ─────── */
const COMPLETED_CHALLENGES_KEY_PREFIX = "maydan_seen_completed_challenges:";

async function checkCompletedChallenges(
  dbUser: DbUser | null,
): Promise<AppNotif | null> {
  if (!dbUser?.id) return null;
  try {
    const { data, error } = await supabase
      .from("challenges")
      .select("id, opponent_name, status, created_at")
      .eq("creator_id", dbUser.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data?.length) return null;
    const key = COMPLETED_CHALLENGES_KEY_PREFIX + dbUser.id;
    const seen = new Set<string>(
      JSON.parse(localStorage.getItem(key) || "[]") as string[],
    );
    const fresh = data.filter((c) => !seen.has(c.id));
    if (!fresh.length) return null;
    // Mark all as seen so we only notify once per completed challenge
    const updated = [...Array.from(seen), ...fresh.map((f) => f.id)].slice(-100);
    localStorage.setItem(key, JSON.stringify(updated));
    const first = fresh[0];
    const extra = fresh.length > 1 ? ` (+${fresh.length - 1})` : "";
    return {
      id: "challenge_completed_" + first.id,
      type: "challenge_completed",
      icon: "⚔️",
      title: `${first.opponent_name || "متحدي"} أنهى تحديك! شوف النتيجة${extra}`,
      ctaRoute: `/results/${first.id}/creator`,
      autoDismissMs: 7000,
    };
  } catch (e) {
    console.warn("[notifications] completed challenges check failed", e);
    return null;
  }
}

/* ─────── challenge reminder (creator: opponent hasn't played in 24h+) ─────── */
const REMINDED_CHALLENGES_KEY_PREFIX = "maydan_seen_reminded_challenges:";

async function checkChallengeReminders(
  dbUser: DbUser | null,
): Promise<AppNotif | null> {
  if (!dbUser?.id) return null;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("challenges")
      .select("id, opponent_name, status, created_at")
      .eq("creator_id", dbUser.id)
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data?.length) return null;
    const key = REMINDED_CHALLENGES_KEY_PREFIX + dbUser.id;
    const seen = new Set<string>(
      JSON.parse(localStorage.getItem(key) || "[]") as string[],
    );
    const fresh = data.filter((c) => !seen.has(c.id));
    if (!fresh.length) return null;
    const updated = [...Array.from(seen), ...fresh.map((f) => f.id)].slice(-100);
    localStorage.setItem(key, JSON.stringify(updated));
    const first = fresh[0];
    const extra = fresh.length > 1 ? ` (+${fresh.length - 1})` : "";
    return {
      id: "challenge_reminder_" + first.id,
      type: "challenge_reminder",
      icon: "⏳",
      title: `تحديك لـ ${first.opponent_name || "صديقك"} لا يزال في الانتظار${extra}`,
      ctaRoute: `/profile`,
      autoDismissMs: 7000,
    };
  } catch (e) {
    console.warn("[notifications] reminder check failed", e);
    return null;
  }
}

/* ─────── public API: collect all, respecting dedup + user prefs ─────── */
export async function collectNotifications(
  dbUser: DbUser | null,
): Promise<AppNotif[]> {
  const out: AppNotif[] = [];

  const sync: Array<[NotifType, AppNotif | null]> = [
    ["streak_danger", checkStreakDanger(dbUser)],
  ];
  for (const [type, n] of sync) {
    if (!isEnabled(type)) continue;
    if (n && !sessionSeen(type) && !persistedSeenToday(type)) out.push(n);
  }

  const asyncResults = await Promise.allSettled([
    checkDailyChallenge(dbUser),
    checkRankDropped(dbUser),
    checkCompletedChallenges(dbUser),
    checkChallengeReminders(dbUser),
  ]);
  for (const r of asyncResults) {
    if (r.status !== "fulfilled" || !r.value) continue;
    if (!isEnabled(r.value.type)) continue;
    // challenge_completed and challenge_reminder dedupe by id inside the producer,
    // so we bypass the per-type session/day dedup for them.
    if (
      r.value.type !== "challenge_completed" &&
      r.value.type !== "challenge_reminder"
    ) {
      if (sessionSeen(r.value.type) || persistedSeenToday(r.value.type)) continue;
    }
    out.push(r.value);
  }
  return out;
}

export function markNotifShown(n: AppNotif) {
  markSessionSeen(n.type);
  // Persist daily-cadence types so they don't reappear after reload
  if (
    n.type === "streak_danger" ||
    n.type === "rank_dropped" ||
    n.type === "daily_challenge"
  ) {
    markPersistedSeenToday(n.type);
  }
}

/* ─────── ad-hoc push (e.g. achievements) ─────── */
const NOTIF_EVENT = "maydan:notify";

export function pushNotification(n: Omit<AppNotif, "id"> & { id?: string }) {
  const full: AppNotif = {
    id: n.id ?? `${n.type}_${Date.now()}`,
    autoDismissMs: 4000,
    ...n,
  };
  window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: full }));
}

export function pushAchievement(name: string) {
  if (!isEnabled("achievement")) return;
  pushNotification({
    type: "achievement",
    icon: "🏅",
    title: `إنجاز جديد! ${name}`,
    autoDismissMs: 4000,
  });
}

export function onNotifEvent(handler: (n: AppNotif) => void): () => void {
  const listener = (e: Event) => {
    const n = (e as CustomEvent<AppNotif>).detail;
    if (n) handler(n);
  };
  window.addEventListener(NOTIF_EVENT, listener);
  return () => window.removeEventListener(NOTIF_EVENT, listener);
}

/* ─────── trigger event so anywhere can request a check ─────── */
export const NOTIF_CHECK_EVENT = "maydan:check-notifications";
export function requestNotifCheck() {
  window.dispatchEvent(new Event(NOTIF_CHECK_EVENT));
}
