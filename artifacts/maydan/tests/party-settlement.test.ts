import { describe, expect, it } from "vitest";
import {
  canTransitionSettledPartyStatus,
  isAtomicSettlementSnapshot,
  partySettlementResumeDecision,
  settlementWouldAddPoints,
} from "@/lib/partySettlement";

describe("Party settlement resume decisions", () => {
  it("resumes the question when reload happens before settlement", () => {
    expect(partySettlementResumeDecision("question", 3, 2)).toBe("resume-question");
  });

  it("cannot represent a conceptual partial mid-award state", () => {
    expect(isAtomicSettlementSnapshot("question", 3, 2)).toBe(true);
    expect(isAtomicSettlementSnapshot("reveal", 3, 3)).toBe(true);
    expect(isAtomicSettlementSnapshot("reveal", 3, 2)).toBe(false);
  });

  it("schedules the leaderboard for an already-settled reveal", () => {
    expect(partySettlementResumeDecision("reveal", 3, 3)).toBe("schedule-leaderboard");
  });

  it("makes a repeated settled call a no-op for points", () => {
    expect(settlementWouldAddPoints(3, 3)).toBe(false);
    expect(settlementWouldAddPoints(3, 4)).toBe(false);
  });

  it("rejects reveal and leaderboard transitions before settlement", () => {
    expect(canTransitionSettledPartyStatus("question", "reveal", 3, 2)).toBe(false);
    expect(canTransitionSettledPartyStatus("question", "leaderboard", 3, 2)).toBe(false);
    expect(canTransitionSettledPartyStatus("question", "leaderboard", 3, 3)).toBe(false);
  });

  it("allows leaderboard only from a settled reveal", () => {
    expect(canTransitionSettledPartyStatus("reveal", "leaderboard", 3, 3)).toBe(true);
    expect(canTransitionSettledPartyStatus("leaderboard", "finished", 3, 3)).toBe(true);
  });
});