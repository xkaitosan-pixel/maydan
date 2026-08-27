export const PARTY_HOST_SESSION_KEY = "maydan.party.host.session";
export const PARTY_GUEST_SESSION_KEY = "maydan.party.guest.session";

export interface PartyHostSession {
  role: "host";
  roomCode: string;
  token: string;
}

export interface PartyGuestSession {
  role: "guest";
  roomCode: string;
  playerId: string;
  token: string;
  nickname: string;
}

const validToken = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 32;
const validRoom = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 32;

export function serializePartyHostSession(value: PartyHostSession): string {
  return JSON.stringify(value);
}

export function parsePartyHostSession(raw: string | null): PartyHostSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PartyHostSession>;
    return value.role === "host" && validRoom(value.roomCode) && validToken(value.token)
      ? { role: "host", roomCode: value.roomCode, token: value.token }
      : null;
  } catch {
    return null;
  }
}

export function serializePartyGuestSession(value: PartyGuestSession): string {
  return JSON.stringify(value);
}

export function parsePartyGuestSession(raw: string | null): PartyGuestSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PartyGuestSession>;
    return value.role === "guest" &&
      validRoom(value.roomCode) &&
      typeof value.playerId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.playerId) &&
      validToken(value.token) &&
      typeof value.nickname === "string" &&
      value.nickname.trim().length > 0
      ? {
          role: "guest",
          roomCode: value.roomCode,
          playerId: value.playerId,
          token: value.token,
          nickname: value.nickname,
        }
      : null;
  } catch {
    return null;
  }
}

export type ResumablePartyStatus =
  | "lobby"
  | "question"
  | "reveal"
  | "leaderboard"
  | "finished";

export function guestResumePhase(
  status: ResumablePartyStatus,
  answeredCurrent: boolean,
): "waiting" | "question" | "answered" | "reveal" | "leaderboard" | "finished" {
  if (status === "lobby") return "waiting";
  if (status === "question") return answeredCurrent ? "answered" : "question";
  return status;
}