export function calcPartyPoints(
  elapsedMs: number,
  answerTimeSec: number,
  scoring: string,
): number {
  if (scoring === "equal") return 1000;
  const maxMs = answerTimeSec * 1000;
  return Math.max(
    100,
    Math.round(1000 - (Math.min(elapsedMs, maxMs) / maxMs) * 900),
  );
}

export function validatedPartyElapsed(
  answeredAtMs: number | null | undefined,
  questionStartMs: number,
  answerTimeSec: number,
): number | null {
  if (
    answeredAtMs === null ||
    answeredAtMs === undefined ||
    !Number.isFinite(answeredAtMs) ||
    !Number.isFinite(questionStartMs)
  ) return null;
  const elapsedMs = answeredAtMs - questionStartMs;
  const deadlineMs = answerTimeSec * 1000;
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > deadlineMs
  ) {
    return null;
  }
  return elapsedMs;
}

export function partyPointsFromServerTiming(
  isCorrect: boolean,
  answeredAtMs: number | null | undefined,
  questionStartMs: number,
  answerTimeSec: number,
  scoring: string,
): number | null {
  const elapsedMs = validatedPartyElapsed(
    answeredAtMs,
    questionStartMs,
    answerTimeSec,
  );
  if (elapsedMs === null) return null;
  return isCorrect ? calcPartyPoints(elapsedMs, answerTimeSec, scoring) : 0;
}

export function partyRoundPointsFromAcceptedResponse(
  responseQuestionIndex: number,
  currentQuestionIndex: number,
  isCorrect: boolean,
  answeredAtMs: number | null | undefined,
  questionStartMs: number,
  answerTimeSec: number,
  scoring: string,
): number | null {
  if (responseQuestionIndex !== currentQuestionIndex) return null;
  return partyPointsFromServerTiming(
    isCorrect,
    answeredAtMs,
    questionStartMs,
    answerTimeSec,
    scoring,
  );
}

export function isCurrentPartyAnswerResponse(
  responseQuestionIndex: number,
  currentQuestionIndex: number,
): boolean {
  return responseQuestionIndex === currentQuestionIndex;
}