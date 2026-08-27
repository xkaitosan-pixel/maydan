import { describe, expect, it } from "vitest";
import {
  PARTY_HOST_LEASE_MS,
  PARTY_ROOM_RETENTION_MS,
  partyLeaseAction,
} from "@/lib/partyLease";

describe("Party host lease boundaries", () => {
  const now = 1_700_000_000_000;

  it("keeps a host reload within the lease active", () => {
    expect(partyLeaseAction("question", now - PARTY_HOST_LEASE_MS, null, now)).toBe("active");
  });

  it("finishes a room after a closed host exceeds the lease", () => {
    expect(partyLeaseAction("lobby", now - PARTY_HOST_LEASE_MS - 1, null, now)).toBe("finish");
  });

  it("deletes a finished or abandoned room after one hour", () => {
    expect(partyLeaseAction("finished", now, now - PARTY_ROOM_RETENTION_MS - 1, now)).toBe("delete");
    expect(partyLeaseAction("question", now - PARTY_ROOM_RETENTION_MS - 1, null, now)).toBe("delete");
  });
});