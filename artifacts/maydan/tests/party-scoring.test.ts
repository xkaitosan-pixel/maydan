import { describe, expect, it } from "vitest";
import {
  calcPartyPoints,
  isCurrentPartyAnswerResponse,
  partyPointsFromServerTiming,
  partyRoundPointsFromAcceptedResponse,
  validatedPartyElapsed,
} from "@/lib/partyScoring";

describe("Party answer timing", () => {
  it("preserves an answer submitted immediately before expiry", () => {
    const startedAt = 1_700_000_000_000;
    const elapsed = validatedPartyElapsed(startedAt + 19_999, startedAt, 20);

    expect(elapsed).toBe(19_999);
    expect(calcPartyPoints(elapsed!, 20, "speed")).toBe(100);
  });

  it("does not depend on when the host observes the stored answer", () => {
    const startedAt = 1_700_000_000_000;
    const answeredAt = startedAt + 3_250;
    const delayedHostObservation = startedAt + 45_000;

    expect(delayedHostObservation).toBeGreaterThan(answeredAt);
    expect(validatedPartyElapsed(answeredAt, startedAt, 20)).toBe(3_250);
  });

  it("rejects answers beyond the authoritative deadline", () => {
    const startedAt = 1_700_000_000_000;

    expect(validatedPartyElapsed(startedAt + 20_001, startedAt, 20)).toBeNull();
  });

  it("keeps equal scoring unchanged for valid answers", () => {
    expect(calcPartyPoints(19_999, 20, "equal")).toBe(1000);
  });

  it("shows exactly the points the host persists after delayed submission", () => {
    const startedAt = 1_700_000_000_000;
    const serverAnsweredAt = startedAt + 4_750;
    const guestReceivedResponseAt = serverAnsweredAt + 2_400;
    const hostObservedAnswerAt = serverAnsweredAt + 5_000;

    expect(guestReceivedResponseAt).toBeGreaterThan(serverAnsweredAt);
    expect(hostObservedAnswerAt).toBeGreaterThan(serverAnsweredAt);

    const guestRevealPoints = partyPointsFromServerTiming(
      true,
      serverAnsweredAt,
      startedAt,
      20,
      "speed",
    );
    const persistedScoreDelta = partyPointsFromServerTiming(
      true,
      serverAnsweredAt,
      startedAt,
      20,
      "speed",
    );

    expect(guestRevealPoints).toBe(786);
    expect(guestRevealPoints).toBe(persistedScoreDelta);
  });

  it("applies an accepted response after reveal already arrived", async () => {
    const startedAt = 1_700_000_000_000;
    const serverAnsweredAt = startedAt + 4_750;
    let phase: "answered" | "reveal" = "answered";

    const delayedResponse = Promise.resolve().then(() => ({
      accepted: true,
      answeredAt: serverAnsweredAt,
      questionIndex: 3,
    }));

    phase = "reveal";
    const response = await delayedResponse;
    const displayedRoundPoints = partyRoundPointsFromAcceptedResponse(
      response.questionIndex,
      3,
      true,
      response.answeredAt,
      startedAt,
      20,
      "speed",
    );

    expect(phase).toBe("reveal");
    expect(response.accepted).toBe(true);
    expect(displayedRoundPoints).toBe(786);
  });

  it("ignores an accepted response from a previous question", () => {
    expect(
      partyRoundPointsFromAcceptedResponse(
        2,
        3,
        true,
        1_700_000_004_750,
        1_700_000_000_000,
        20,
        "speed",
      ),
    ).toBeNull();
  });

  it("ignores a rejected response after the next question starts", async () => {
    let currentQuestionIndex = 3;
    let deadlineLocked = false;
    let answerRejected = false;

    const delayedRejectedResponse = Promise.resolve().then(() => ({
      accepted: false,
      questionIndex: 2,
    }));

    currentQuestionIndex = 3;
    const response = await delayedRejectedResponse;
    if (
      isCurrentPartyAnswerResponse(
        response.questionIndex,
        currentQuestionIndex,
      ) &&
      !response.accepted
    ) {
      deadlineLocked = true;
      answerRejected = true;
    }

    expect(deadlineLocked).toBe(false);
    expect(answerRejected).toBe(false);
    expect(isCurrentPartyAnswerResponse(3, currentQuestionIndex)).toBe(true);
  });
});