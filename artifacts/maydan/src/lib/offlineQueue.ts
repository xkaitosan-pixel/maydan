import { supabase } from "./supabase";

const QUEUE_KEY = "maydan_offline_actions_v1";
export const OFFLINE_QUEUE_EVENT = "maydan:offline-queue";

export interface DailyScorePayload {
  user_id: string;
  date: string;
  display_name: string;
  country: string;
  score: number;
  total: number;
  completed_at: string;
}

interface DailyScoreAction {
  id: string;
  type: "daily_score_upsert";
  payload: DailyScorePayload;
  createdAt: number;
}

type OfflineAction = DailyScoreAction;
let flushPromise: Promise<number> | null = null;

function readQueue(): OfflineAction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineAction[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT, { detail: queue.length }));
}

function queueDailyScore(payload: DailyScorePayload): void {
  const id = `daily:${payload.user_id}:${payload.date}`;
  const queue = readQueue().filter((action) => action.id !== id);
  queue.push({ id, type: "daily_score_upsert", payload, createdAt: Date.now() });
  try {
    writeQueue(queue);
  } catch {
    // Daily progress remains available in local game storage even if this fails.
  }
}

export function getPendingOfflineActionCount(): number {
  return readQueue().length;
}

export async function syncOrQueueDailyScore(payload: DailyScorePayload): Promise<"synced" | "queued"> {
  if (!navigator.onLine) {
    queueDailyScore(payload);
    return "queued";
  }
  const { error } = await supabase.from("daily_scores").upsert(payload, { onConflict: "user_id,date" });
  if (error) {
    queueDailyScore(payload);
    return "queued";
  }
  return "synced";
}

export function flushOfflineActions(): Promise<number> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (!navigator.onLine) return getPendingOfflineActionCount();
    const remaining: OfflineAction[] = [];
    for (const action of readQueue()) {
      const { error } = await supabase
        .from("daily_scores")
        .upsert(action.payload, { onConflict: "user_id,date" });
      if (error) remaining.push(action);
    }
    try {
      writeQueue(remaining);
    } catch {
      return remaining.length;
    }
    return remaining.length;
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}