import { describe, expect, it } from "vitest";
import {
  confirmResultSettlement,
  reserveResultSettlement,
} from "../src/lib/resultSettlement";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("result settlement reservation", () => {
  it("blocks a reload from repeating side effects after an ambiguous request", () => {
    const storage = memoryStorage();
    expect(reserveResultSettlement(storage, "challenge-1", "creator")).toEqual({
      reserved: true,
      status: "pending",
    });
    expect(reserveResultSettlement(storage, "challenge-1", "creator")).toEqual({
      reserved: false,
      status: "pending",
    });
  });

  it("keeps a confirmed completion idempotent", () => {
    const storage = memoryStorage();
    reserveResultSettlement(storage, "challenge-2", "challenger");
    confirmResultSettlement(storage, "challenge-2", "challenger");
    expect(reserveResultSettlement(storage, "challenge-2", "challenger")).toEqual({
      reserved: false,
      status: "confirmed",
    });
  });

  it("treats legacy completed guards as confirmed", () => {
    const storage = memoryStorage();
    storage.setItem("maydan_results_awarded_challenge-3_creator", "1");
    expect(reserveResultSettlement(storage, "challenge-3", "creator")).toEqual({
      reserved: false,
      status: "confirmed",
    });
  });
});