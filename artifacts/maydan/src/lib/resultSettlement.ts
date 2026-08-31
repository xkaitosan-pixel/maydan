export type ResultSettlementStatus = "pending" | "confirmed";

interface SettlementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function resultSettlementKey(challengeId: string, role: string): string {
  return `maydan_results_awarded_${challengeId}_${role}`;
}

export function reserveResultSettlement(
  storage: SettlementStorage,
  challengeId: string,
  role: string,
): { reserved: boolean; status: ResultSettlementStatus } {
  const key = resultSettlementKey(challengeId, role);
  const existing = storage.getItem(key);
  if (existing) {
    if (existing === "1") return { reserved: false, status: "confirmed" };
    try {
      const parsed = JSON.parse(existing) as { status?: string };
      return {
        reserved: false,
        status: parsed.status === "confirmed" ? "confirmed" : "pending",
      };
    } catch {
      return { reserved: false, status: "pending" };
    }
  }
  storage.setItem(key, JSON.stringify({
    status: "pending",
    challengeId,
    role,
    startedAt: new Date().toISOString(),
  }));
  return { reserved: true, status: "pending" };
}

export function confirmResultSettlement(
  storage: SettlementStorage,
  challengeId: string,
  role: string,
): void {
  storage.setItem(resultSettlementKey(challengeId, role), JSON.stringify({
    status: "confirmed",
    challengeId,
    role,
    confirmedAt: new Date().toISOString(),
  }));
}