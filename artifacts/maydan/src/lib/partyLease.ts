export const PARTY_HOST_LEASE_MS = 30_000;
export const PARTY_ROOM_RETENTION_MS = 60 * 60 * 1000;

export type PartyLeaseAction = "active" | "finished" | "finish" | "delete";

export function partyLeaseAction(
  status: string,
  hostLastSeenAt: number,
  finishedAt: number | null,
  now: number,
): PartyLeaseAction {
  const reference = status === "finished"
    ? (finishedAt ?? hostLastSeenAt)
    : hostLastSeenAt;
  if (reference < now - PARTY_ROOM_RETENTION_MS) return "delete";
  if (status === "finished") return "finished";
  if (hostLastSeenAt < now - PARTY_HOST_LEASE_MS) return "finish";
  return "active";
}