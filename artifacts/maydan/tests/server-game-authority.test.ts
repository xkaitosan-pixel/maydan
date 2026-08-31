import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase-migrations.sql"),
  "utf8",
);
const dbClient = readFileSync(resolve(process.cwd(), "src/lib/db.ts"), "utf8");
const resultsPage = readFileSync(resolve(process.cwd(), "src/pages/Results.tsx"), "utf8");
const survivalPage = readFileSync(resolve(process.cwd(), "src/pages/Survival.tsx"), "utf8");

function functionBody(name: string): string {
  const start = migration.indexOf(`FUNCTION public.${name}`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("server-authoritative Ranked and Daily contracts", () => {
  it("defines Ranked base tables before altering them on a blank database", () => {
    const queueCreate = migration.indexOf("CREATE TABLE IF NOT EXISTS public.ranked_queue");
    const queueAlter = migration.indexOf("ALTER TABLE public.ranked_queue");
    const matchCreate = migration.indexOf("CREATE TABLE IF NOT EXISTS public.ranked_matches");
    const matchAlter = migration.indexOf("ALTER TABLE public.ranked_matches");
    expect(queueCreate).toBeGreaterThan(-1);
    expect(matchCreate).toBeGreaterThan(-1);
    expect(queueCreate).toBeLessThan(queueAlter);
    expect(matchCreate).toBeLessThan(matchAlter);
  });

  it("serializes matchmaking and prevents a duplicate active pair", () => {
    const body = functionBody("enter_ranked_queue");
    expect(body).toContain("FOR UPDATE SKIP LOCKED");
    expect(body).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(body).toContain("INSERT INTO public.ranked_active_players");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ranked_active_players");
    expect(migration).toContain("user_id text PRIMARY KEY");
    expect(body).toContain("question_ids");
    expect(migration).toContain("ranked_matches_active_pair_key");
    expect(migration).toContain("WHERE status = 'active'");
  });

  it("accepts each Ranked answer once and scores from the database clock", () => {
    const body = functionBody("submit_ranked_answer");
    expect(body).toContain("clock_timestamp()");
    expect(body).toContain("ON CONFLICT DO NOTHING");
    expect(body).toContain("(q.options->>q.correct) = p_answer_text");
    expect(body).toContain("(v_match.question_ids->>p_question_index)::int IS DISTINCT FROM p_question_id");
    expect(migration).toContain("PRIMARY KEY (match_id, user_id, question_index)");
  });

  it("settles a Ranked match and both rewards in one transaction body", () => {
    const body = functionBody("start_or_advance_ranked_match");
    expect(body).toContain("settled_at IS NULL");
    expect(body.match(/apply_game_reward/g)).toHaveLength(2);
    expect(body).toContain("rank_points = greatest(0");
    expect(body).toContain("DELETE FROM public.ranked_active_players");
  });

  it("locks one Daily attempt and makes a repeated final submission a no-op", () => {
    const start = functionBody("start_daily_attempt");
    const submit = functionBody("submit_daily_answer");
    expect(migration).toContain("UNIQUE (user_id, challenge_date)");
    expect(start).toContain("ON CONFLICT (user_id, challenge_date) DO NOTHING");
    expect(submit).toContain("FOR UPDATE");
    expect(submit).toContain("ON CONFLICT DO NOTHING");
    expect(submit).toContain("ON CONFLICT (user_id, date) DO NOTHING");
    expect(submit).toContain("(v_attempt.question_ids->>p_question_index)::int IS DISTINCT FROM p_question_id");
  });

  it("uses an event ledger so retries after an interrupted response cannot pay twice", () => {
    const body = functionBody("apply_game_reward");
    expect(migration).toContain("PRIMARY KEY (user_id, event_key)");
    expect(body).toContain("ON CONFLICT DO NOTHING");
    expect(body).toContain("IF NOT FOUND THEN");
    expect(body).toContain("FOR UPDATE");
  });

  it("removes direct client writes and binds registered users to auth.uid", () => {
    const identity = functionBody("assert_game_user");
    expect(identity).toContain("u.auth_id = auth.uid()");
    expect(identity).toContain("token_hash = extensions.digest(p_guest_token, 'sha256')");
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.daily_scores FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.ranked_matches FROM PUBLIC, anon, authenticated",
    );
  });
});

describe("server-authoritative Challenge and Survival settlement", () => {
  it("derives a stable Challenge event key and accepts it only once", () => {
    const submission = functionBody("submit_challenge_game_result");
    const body = functionBody("settle_challenge_game");
    expect(submission).toContain("Invalid challenge answer sequence");
    expect(submission).toContain("creator_score = v_score");
    expect(submission).toContain("opponent_score = v_score");
    expect(body).toContain("'challenge:' || p_challenge_id::text || ':' || p_role");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("public.apply_game_reward");
    expect(body).toContain("IF v_reward.applied THEN");
  });

  it("derives Survival settlement from one server-created attempt", () => {
    const start = functionBody("start_survival_attempt");
    const body = functionBody("settle_survival_game");
    expect(start).toContain("INSERT INTO public.survival_attempts");
    expect(start).toContain("question_ids");
    expect(body).toContain("WHERE attempt.id = p_attempt_id AND attempt.user_id = p_user_id");
    expect(body).toContain("Invalid survival answer sequence");
    expect(body).toContain("'survival:' || p_attempt_id::text");
    expect(body).toContain("public.apply_game_reward");
    expect(survivalPage).toContain("startSurvivalAttempt");
    expect(survivalPage).toContain("survivalAnswersRef.current");
    expect(survivalPage).toContain("pendingSettlementRef.current");
    expect(survivalPage).toContain("retrySurvivalSettlement");
  });

  it("serializes concurrent profile and engagement updates", () => {
    const rewards = functionBody("apply_game_reward");
    const engagement = functionBody("apply_game_engagement");
    expect(rewards).toContain("FOR UPDATE");
    expect(engagement).toContain("FOR UPDATE");
    expect(rewards).toContain("ON CONFLICT DO NOTHING");
    expect(engagement).toContain("'{engagement}'");
  });

  it("rejects direct leaderboard writes while granting only settlement RPCs", () => {
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.scores FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.settle_challenge_game(uuid,text,text,int,int,text) TO anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.challenges FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.delete_challenge_game(uuid,text,text) TO anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.settle_survival_game(uuid,text,text,jsonb,text) TO anon, authenticated",
    );
  });

  it("shows only confirmed RPC rewards and offers an idempotent retry", () => {
    expect(dbClient).toContain('supabase.rpc("settle_challenge_game"');
    expect(dbClient).toContain('supabase.rpc("submit_challenge_game_result"');
    expect(dbClient).toContain('supabase.rpc("settle_survival_game"');
    expect(resultsPage).toContain("result.xp_gained");
    expect(resultsPage).toContain("إعادة المحاولة");
    expect(resultsPage).toContain("reserveResultSettlement");
    expect(resultsPage).toContain("updatePendingChallengeSettlement");
    expect(survivalPage).toContain("readPendingSurvivalSettlements");
    expect(resultsPage).not.toContain("awardGameRewards({");
    expect(survivalPage).not.toContain("awardGameRewards({");
  });
});