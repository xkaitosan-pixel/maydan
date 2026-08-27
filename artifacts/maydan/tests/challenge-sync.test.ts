import { describe, expect, it } from "vitest";
import { challengeFromDb } from "@/lib/challengeSync";
import type { DbChallenge } from "@/lib/db";

function row(overrides: Partial<DbChallenge> = {}): DbChallenge {
  return {
    id: "challenge-1",
    creator_id: "creator-1",
    creator_name: "المنشئ",
    opponent_id: null,
    opponent_name: null,
    status: "pending",
    creator_score: 4,
    opponent_score: null,
    category: "history",
    question_ids: "[1,2]",
    creator_answers: "[0,1]",
    opponent_answers: null,
    question_count: 2,
    created_at: "2026-08-27T00:00:00.000Z",
    winner: null,
    ...overrides,
  };
}

describe("challengeFromDb", () => {
  it("hydrates a completed cross-device result", () => {
    expect(challengeFromDb(row({
      status: "completed",
      opponent_name: "المتحدي",
      opponent_score: 5,
      opponent_answers: "[1,0]",
    }))).toMatchObject({
      status: "completed",
      challengerName: "المتحدي",
      challengerScore: 5,
      challengerAnswers: [1, 0],
    });
  });

  it("treats malformed arrays as empty instead of crashing", () => {
    expect(challengeFromDb(row({ question_ids: "{bad" })).questions).toEqual([]);
  });
});