export type PartySettlementResumeDecision =
  | "resume-question"
  | "settle-reveal"
  | "schedule-leaderboard"
  | "none";

export function partySettlementResumeDecision(
  status: string,
  currentQuestion: number,
  settledQuestion: number,
): PartySettlementResumeDecision {
  if (status === "question") return "resume-question";
  if (status === "reveal") {
    return settledQuestion >= currentQuestion
      ? "schedule-leaderboard"
      : "settle-reveal";
  }
  return "none";
}

export function isAtomicSettlementSnapshot(
  status: string,
  currentQuestion: number,
  settledQuestion: number,
): boolean {
  return (
    (status === "question" && settledQuestion < currentQuestion) ||
    (status === "reveal" && settledQuestion >= currentQuestion)
  );
}

export function settlementWouldAddPoints(
  currentQuestion: number,
  settledQuestion: number,
): boolean {
  return settledQuestion < currentQuestion;
}

export function canTransitionSettledPartyStatus(
  currentStatus: string,
  nextStatus: string,
  currentQuestion: number,
  settledQuestion: number,
): boolean {
  if (settledQuestion < currentQuestion) return false;
  if (nextStatus === "leaderboard") return currentStatus === "reveal";
  if (nextStatus === "finished") {
    return currentStatus === "reveal" || currentStatus === "leaderboard";
  }
  return false;
}