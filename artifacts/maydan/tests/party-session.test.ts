import { describe, expect, it } from "vitest";
import {
  guestResumePhase,
  parsePartyGuestSession,
  parsePartyHostSession,
  serializePartyGuestSession,
  serializePartyHostSession,
} from "@/lib/partySession";

const token = "12345678-1234-4234-9234-123456789abc";
const playerId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("Party session serialization", () => {
  it("round-trips valid host and guest sessions", () => {
    const host = { role: "host" as const, roomCode: "1234", token };
    const guest = { role: "guest" as const, roomCode: "1234", playerId, token, nickname: "لاعب" };
    expect(parsePartyHostSession(serializePartyHostSession(host))).toEqual(host);
    expect(parsePartyGuestSession(serializePartyGuestSession(guest))).toEqual(guest);
  });

  it("rejects malformed, wrong-role, and weak-capability sessions", () => {
    expect(parsePartyHostSession("{")).toBeNull();
    expect(parsePartyHostSession(JSON.stringify({ role: "guest", roomCode: "1234", token }))).toBeNull();
    expect(parsePartyGuestSession(JSON.stringify({
      role: "guest", roomCode: "1234", playerId: "not-a-uuid", token: "short", nickname: "",
    }))).toBeNull();
  });
});

describe("Party resume state", () => {
  it("restores a lobby guest to waiting", () => {
    expect(guestResumePhase("lobby", false)).toBe("waiting");
  });

  it("restores an answered active-question guest as answered", () => {
    expect(guestResumePhase("question", true)).toBe("answered");
  });
});