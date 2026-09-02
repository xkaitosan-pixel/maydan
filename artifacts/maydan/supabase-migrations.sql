-- =====================================================================
-- Maydan — Database Migrations
-- Run in: Supabase Dashboard → SQL Editor
-- All statements are idempotent (safe to run multiple times)
-- =====================================================================
-- STATUS (last verified 2026-04-29):
--   ✅ party_rooms.auto_advance_seconds      — EXISTS
--   ✅ party_rooms.question_start_time       — EXISTS
--   ✅ users.display_name                    — EXISTS
--   ✅ users.country                         — EXISTS
--   ✅ users.bio                             — EXISTS
--   ✅ daily_scores table                    — EXISTS (all core columns)
--   ❌ daily_scores.country                  — MISSING (run this file to add)
-- =====================================================================

-- 1. Party capabilities + server-authoritative timing
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension AS e
    JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto' AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.party_rooms (
  code text PRIMARY KEY,
  status text NOT NULL DEFAULT 'lobby',
  category text NOT NULL,
  total_questions integer NOT NULL,
  current_question integer NOT NULL DEFAULT 0,
  answer_time integer NOT NULL,
  show_question_on_phone boolean NOT NULL DEFAULT false,
  scoring_type text NOT NULL,
  auto_advance_seconds integer NOT NULL DEFAULT 0,
  question_start_time bigint NOT NULL DEFAULT 0,
  host_token_hash bytea,
  host_last_seen_at bigint,
  finished_at bigint,
  settled_question_index integer NOT NULL DEFAULT -1,
  total_players integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.party_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL REFERENCES public.party_rooms(code) ON DELETE CASCADE,
  nickname text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  answered_current boolean NOT NULL DEFAULT false,
  last_answer integer,
  answered_at bigint,
  player_token_hash bytea,
  UNIQUE (room_code, nickname)
);

ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0;
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0;
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS host_token_hash bytea;
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS host_last_seen_at bigint
  DEFAULT (floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint);
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS finished_at bigint;
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS settled_question_index int NOT NULL DEFAULT -1;
UPDATE public.party_rooms
SET host_last_seen_at = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
WHERE host_last_seen_at IS NULL;
ALTER TABLE public.party_players ADD COLUMN IF NOT EXISTS answered_at bigint;
ALTER TABLE public.party_players ADD COLUMN IF NOT EXISTS player_token_hash bytea;

-- Remove the earlier tokenless overloads if this migration was previously run.
DROP FUNCTION IF EXISTS public.start_party_question(text, int);
DROP FUNCTION IF EXISTS public.submit_party_answer(uuid, text, int, int);

CREATE OR REPLACE FUNCTION public.create_party_room(
  p_room_code text,
  p_category text,
  p_total_questions int,
  p_answer_time int,
  p_show_question_on_phone boolean,
  p_scoring_type text,
  p_auto_advance_seconds int,
  p_host_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now bigint;
BEGIN
  IF p_host_token IS NULL OR length(p_host_token) < 32
     OR p_total_questions <= 0
     OR p_answer_time <= 0
     OR p_scoring_type NOT IN ('speed', 'equal') THEN
    RAISE EXCEPTION 'Invalid party room parameters';
  END IF;

  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;

  -- Opportunistic global cleanup for rooms with no remaining connected client.
  DELETE FROM public.party_players AS pp
  WHERE pp.room_code IN (
    SELECT pr.code FROM public.party_rooms AS pr
    WHERE coalesce(pr.finished_at, pr.host_last_seen_at, 0) < v_now - 3600000
  );
  DELETE FROM public.party_rooms AS pr
  WHERE coalesce(pr.finished_at, pr.host_last_seen_at, 0) < v_now - 3600000;

  INSERT INTO public.party_rooms (
    code, status, category, total_questions, current_question, answer_time,
    show_question_on_phone, scoring_type, auto_advance_seconds,
    question_start_time, host_token_hash, host_last_seen_at, finished_at
  ) VALUES (
    p_room_code, 'lobby', p_category, p_total_questions, 0, p_answer_time,
    p_show_question_on_phone, p_scoring_type, p_auto_advance_seconds,
    0, extensions.digest(p_host_token, 'sha256'), v_now, NULL
  );
  RETURN p_room_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_party_room(
  p_room_code text,
  p_nickname text,
  p_player_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_player_id uuid;
BEGIN
  IF p_player_token IS NULL OR length(p_player_token) < 32
     OR p_nickname IS NULL OR length(trim(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'Invalid player parameters';
  END IF;

  PERFORM 1 FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code AND pr.status = 'lobby'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party room is not accepting players';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.party_players AS pp
    WHERE pp.room_code = p_room_code AND pp.nickname = trim(p_nickname)
  ) THEN
    RAISE EXCEPTION 'Nickname is already in use';
  END IF;

  INSERT INTO public.party_players (
    room_code, nickname, score, answered_current, last_answer,
    answered_at, player_token_hash
  ) VALUES (
    p_room_code, trim(p_nickname), 0, false, NULL,
    NULL, extensions.digest(p_player_token, 'sha256')
  )
  RETURNING id INTO v_player_id;
  RETURN v_player_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_party_question(
  p_room_code text,
  p_question_index int,
  p_host_token text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_started_at bigint;
BEGIN
  PERFORM 1 FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid host capability'; END IF;
  IF p_question_index < 0 THEN RAISE EXCEPTION 'Invalid question index'; END IF;

  v_started_at := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  UPDATE public.party_players AS pp
  SET answered_current = false, last_answer = NULL, answered_at = NULL
  WHERE pp.room_code = p_room_code;
  UPDATE public.party_rooms AS pr
  SET status = 'question', current_question = p_question_index,
      question_start_time = v_started_at, host_last_seen_at = v_started_at
  WHERE pr.code = p_room_code;
  RETURN v_started_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_party_answer(
  p_player_id uuid,
  p_room_code text,
  p_question_index int,
  p_answer int,
  p_player_token text
)
RETURNS TABLE(accepted boolean, answered_at bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
  v_current_question int;
  v_question_start bigint;
  v_answer_time int;
  v_now bigint;
  v_answered_at bigint;
BEGIN
  SELECT pr.status, pr.current_question, pr.question_start_time, pr.answer_time
  INTO v_status, v_current_question, v_question_start, v_answer_time
  FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code
  FOR UPDATE;

  IF NOT FOUND OR v_status <> 'question'
     OR v_current_question <> p_question_index
     OR v_question_start IS NULL OR v_question_start <= 0
     OR v_answer_time IS NULL OR v_answer_time <= 0
     OR p_answer < 0 OR p_answer > 3 THEN
    RETURN QUERY SELECT false, NULL::bigint;
    RETURN;
  END IF;

  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  IF v_now > v_question_start + (v_answer_time::bigint * 1000) THEN
    RETURN QUERY SELECT false, NULL::bigint;
    RETURN;
  END IF;

  UPDATE public.party_players AS pp
  SET answered_current = true, last_answer = p_answer, answered_at = v_now
  WHERE pp.id = p_player_id
    AND pp.room_code = p_room_code
    AND pp.player_token_hash = extensions.digest(p_player_token, 'sha256')
    AND pp.answered_current = false
  RETURNING pp.answered_at INTO v_answered_at;

  IF v_answered_at IS NULL THEN
    RETURN QUERY SELECT false, NULL::bigint;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, v_answered_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_party_total_players(
  p_room_code text, p_total_players int, p_host_token text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF p_total_players < 0 THEN RAISE EXCEPTION 'Invalid player count'; END IF;
  UPDATE public.party_rooms AS pr
  SET total_players = p_total_players,
      host_last_seen_at = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256');
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid host capability'; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_party_room_status(
  p_room_code text, p_status text, p_host_token text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF p_status NOT IN ('leaderboard', 'finished') THEN
    RAISE EXCEPTION 'Invalid party status';
  END IF;
  UPDATE public.party_rooms AS pr
  SET status = p_status,
      host_last_seen_at = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      finished_at = CASE
        WHEN p_status = 'finished'
          THEN floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
        ELSE pr.finished_at
      END
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256')
    AND (
      (
        p_status = 'leaderboard'
        AND pr.status = 'reveal'
        AND pr.settled_question_index >= pr.current_question
      )
      OR
      (
        p_status = 'finished'
        AND pr.status IN ('reveal', 'leaderboard')
        AND pr.settled_question_index >= pr.current_question
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid host capability or party transition';
  END IF;
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.award_party_points(text, uuid, int, text);

CREATE OR REPLACE FUNCTION public.settle_party_question(
  p_room_code text, p_question_index int, p_correct_answer int, p_host_token text
)
RETURNS TABLE(settled boolean, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
  v_current_question int;
  v_settled_question int;
  v_question_start bigint;
  v_answer_time int;
  v_scoring_type text;
  v_now bigint;
BEGIN
  SELECT pr.status, pr.current_question, pr.settled_question_index,
         pr.question_start_time, pr.answer_time, pr.scoring_type
  INTO v_status, v_current_question, v_settled_question,
       v_question_start, v_answer_time, v_scoring_type
  FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256')
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid host capability'; END IF;
  IF v_current_question <> p_question_index
     OR p_correct_answer < 0 OR p_correct_answer > 3
     OR v_status NOT IN ('question', 'reveal') THEN
    RAISE EXCEPTION 'Invalid party settlement state';
  END IF;

  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  IF v_settled_question >= p_question_index THEN
    UPDATE public.party_rooms AS pr
    SET status = 'reveal', host_last_seen_at = v_now
    WHERE pr.code = p_room_code;
    RETURN QUERY SELECT true, 'reveal'::text;
    RETURN;
  END IF;

  IF v_question_start IS NULL OR v_question_start <= 0
     OR v_answer_time IS NULL OR v_answer_time <= 0
     OR v_scoring_type NOT IN ('speed', 'equal') THEN
    RAISE EXCEPTION 'Invalid party timing state';
  END IF;

  -- One set-based score update inside this transaction: no player can be
  -- partially settled, and invalid/late server timestamps never qualify.
  UPDATE public.party_players AS pp
  SET score = pp.score + CASE
    WHEN v_scoring_type = 'equal' THEN 1000
    ELSE greatest(
      100,
      round(
        1000 - (
          least(pp.answered_at - v_question_start, v_answer_time::bigint * 1000)::numeric
          / (v_answer_time::bigint * 1000)::numeric
        ) * 900
      )::int
    )
  END
  WHERE pp.room_code = p_room_code
    AND pp.answered_current = true
    AND pp.last_answer = p_correct_answer
    AND pp.answered_at IS NOT NULL
    AND pp.answered_at >= v_question_start
    AND pp.answered_at <= v_question_start + (v_answer_time::bigint * 1000);

  UPDATE public.party_rooms AS pr
  SET settled_question_index = p_question_index,
      status = 'reveal',
      host_last_seen_at = v_now
  WHERE pr.code = p_room_code;

  RETURN QUERY SELECT true, 'reveal'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_party_room(
  p_room_code text, p_host_token text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM 1 FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid host capability'; END IF;
  DELETE FROM public.party_players AS pp WHERE pp.room_code = p_room_code;
  DELETE FROM public.party_rooms AS pr WHERE pr.code = p_room_code;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_party_host(
  p_room_code text, p_host_token text
)
RETURNS TABLE(
  code text, status text, category text, total_questions int,
  current_question int, answer_time int, show_question_on_phone boolean,
  scoring_type text, auto_advance_seconds int, total_players int,
  question_start_time bigint, settled_question_index int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_now bigint;
BEGIN
  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  RETURN QUERY
  UPDATE public.party_rooms AS pr
  SET status = CASE
        WHEN pr.status <> 'finished'
          AND coalesce(pr.host_last_seen_at, 0) < v_now - 30000
          THEN 'finished'
        ELSE pr.status
      END,
      finished_at = CASE
        WHEN pr.status <> 'finished'
          AND coalesce(pr.host_last_seen_at, 0) < v_now - 30000
          THEN v_now
        ELSE pr.finished_at
      END,
      host_last_seen_at = v_now
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256')
  RETURNING pr.code, pr.status, pr.category, pr.total_questions,
            pr.current_question, pr.answer_time, pr.show_question_on_phone,
            pr.scoring_type, pr.auto_advance_seconds, pr.total_players,
            pr.question_start_time, pr.settled_question_index;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_party_player(
  p_room_code text, p_player_id uuid, p_player_token text
)
RETURNS TABLE(
  id uuid, nickname text, score int, answered_current boolean,
  last_answer int
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT pp.id, pp.nickname, pp.score, pp.answered_current, pp.last_answer
  FROM public.party_players AS pp
  WHERE pp.room_code = p_room_code
    AND pp.id = p_player_id
    AND pp.player_token_hash = extensions.digest(p_player_token, 'sha256')
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_party_host(
  p_room_code text, p_host_token text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
  v_last_seen bigint;
  v_now bigint;
BEGIN
  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  SELECT pr.status, pr.host_last_seen_at INTO v_status, v_last_seen
  FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code
    AND pr.host_token_hash = extensions.digest(p_host_token, 'sha256')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid host capability'; END IF;

  IF v_status <> 'finished' AND coalesce(v_last_seen, 0) < v_now - 30000 THEN
    UPDATE public.party_rooms AS pr
    SET status = 'finished', finished_at = v_now
    WHERE pr.code = p_room_code;
    RETURN 'finished';
  ELSIF v_status <> 'finished' THEN
    UPDATE public.party_rooms AS pr
    SET host_last_seen_at = v_now
    WHERE pr.code = p_room_code;
  END IF;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintain_party_room(p_room_code text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
  v_last_seen bigint;
  v_finished_at bigint;
  v_now bigint;
BEGIN
  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  SELECT pr.status, pr.host_last_seen_at, pr.finished_at
  INTO v_status, v_last_seen, v_finished_at
  FROM public.party_rooms AS pr
  WHERE pr.code = p_room_code
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;

  IF (v_status = 'finished' AND coalesce(v_finished_at, v_last_seen, 0) < v_now - 3600000)
     OR (v_status <> 'finished' AND coalesce(v_last_seen, 0) < v_now - 3600000) THEN
    DELETE FROM public.party_players AS pp WHERE pp.room_code = p_room_code;
    DELETE FROM public.party_rooms AS pr WHERE pr.code = p_room_code;
    RETURN 'deleted';
  END IF;

  IF v_status <> 'finished' AND coalesce(v_last_seen, 0) < v_now - 30000 THEN
    UPDATE public.party_rooms AS pr
    SET status = 'finished', finished_at = v_now
    WHERE pr.code = p_room_code;
    RETURN 'finished';
  END IF;

  RETURN CASE WHEN v_status = 'finished' THEN 'finished' ELSE 'active' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_party_room(
  p_room_code text, p_player_id uuid, p_player_token text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM public.party_players AS pp
  WHERE pp.room_code = p_room_code
    AND pp.id = p_player_id
    AND pp.player_token_hash = extensions.digest(p_player_token, 'sha256');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_party_room(text, text, int, int, boolean, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_party_room(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_party_question(text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_party_answer(uuid, text, int, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_party_total_players(text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_party_room_status(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_party_question(text, int, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_party_room(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_party_host(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_party_player(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_party_room(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_party_host(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintain_party_room(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_party_room(text, text, int, int, boolean, text, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_party_room(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_party_question(text, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_party_answer(uuid, text, int, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_party_total_players(text, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_party_room_status(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_party_question(text, int, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_party_room(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_party_host(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_party_player(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_party_room(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_party_host(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_party_room(text) TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.party_rooms FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.party_players FROM PUBLIC, anon, authenticated;

-- 2. users: profile fields (display name, country, bio, onboarding)
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_categories text[] DEFAULT '{}'::text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text;

-- 3. daily_scores table (create if not exists)
CREATE TABLE IF NOT EXISTS daily_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  country text DEFAULT '',
  score int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 10,
  date text NOT NULL DEFAULT '',
  completed_at timestamptz DEFAULT now()
);

-- 4. daily_scores: add any columns that may be missing if table already existed
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0;
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS total int NOT NULL DEFAULT 10;
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS date text NOT NULL DEFAULT '';
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now();

-- *** THIS IS THE ONLY CURRENTLY MISSING COLUMN ***
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS country text DEFAULT '';

-- 5. Unique constraint: one attempt per user per day
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'daily_scores'::regclass
      AND conname = 'daily_scores_user_id_date_key'
  ) THEN
    ALTER TABLE daily_scores
      ADD CONSTRAINT daily_scores_user_id_date_key UNIQUE (user_id, date);
  END IF;
END $$;

-- 6. Row Level Security for daily_scores
--    Allow anyone to read leaderboard; allow inserts from all users (incl. guests)
ALTER TABLE daily_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_scores' AND policyname = 'daily_scores_read'
  ) THEN
    CREATE POLICY daily_scores_read ON daily_scores FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_scores' AND policyname = 'daily_scores_insert'
  ) THEN
    CREATE POLICY daily_scores_insert ON daily_scores FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_scores' AND policyname = 'daily_scores_update'
  ) THEN
    CREATE POLICY daily_scores_update ON daily_scores FOR UPDATE USING (true);
  END IF;
END $$;

-- =====================================================================
-- 7. Supabase Storage: 'avatars' bucket
-- =====================================================================
-- The bucket has been created programmatically (public: true,
-- allowed_mime_types: jpeg/png/webp/gif, file_size_limit: 5MB).
--
-- If the bucket does not exist yet, create it via Supabase dashboard:
--   Storage → New Bucket → name: avatars, Public bucket: ON
-- Or run the INSERT below (idempotent):

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

-- RLS policies: owner-scoped (each user can only write to their own folder)
-- Profile.tsx uploads to path: `{user_id}/avatar.{ext}`
-- So the first path segment (split_part(name,'/',1)) must equal auth.uid()

-- Ensure RLS is enabled on storage.objects (default in Supabase; guard for non-standard setups)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anyone can read public avatars (bucket is public, but policy is belt-and-suspenders)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_public_read'
  ) THEN
    CREATE POLICY avatars_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'avatars');
  END IF;

  -- Only authenticated users can upload, and only to their own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_insert'
  ) THEN
    CREATE POLICY avatars_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  -- Only the owner can update their own avatar
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_update'
  ) THEN
    CREATE POLICY avatars_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  -- Only the owner can delete their own avatar
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_delete'
  ) THEN
    CREATE POLICY avatars_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END $$;

-- ──────────────────────────── CHALLENGES (cross-device sync) ────────────────────────────
-- The challenges table existed with only minimal columns. The app's createDbChallenge /
-- completeDbChallenge code in src/lib/db.ts requires the columns below. id stays uuid;
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS winner text
  CHECK (winner IS NULL OR winner IN ('creator', 'opponent', 'draw'));
-- the client now generates UUIDs in storage.generateId() to match.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS question_ids       text;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS creator_answers    text;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS opponent_answers   text;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS question_count     int NOT NULL DEFAULT 10;

-- Index to make Profile.tsx "تحدياتي" list (getMyChallenges) fast.
CREATE INDEX IF NOT EXISTS challenges_creator_id_created_at_idx
  ON challenges (creator_id, created_at DESC);

-- ──────────────────────────── FRIENDS (NEW) ────────────────────────────
-- Run this block in Supabase SQL Editor to enable the friends system.
CREATE TABLE IF NOT EXISTS friends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  friend_id    text NOT NULL,
  friend_name  text,
  friend_avatar text,
  friend_country text,
  status       text NOT NULL DEFAULT 'accepted',  -- 'accepted' (one-tap add) | 'pending' | 'blocked'
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friends_user_friend_unique UNIQUE (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS friends_user_id_idx   ON friends (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS friends_friend_id_idx ON friends (friend_id);

-- =====================================================================
-- 8. Ranked + Daily server authority and idempotent game rewards
-- =====================================================================

-- Canonical base definitions keep blank-database installs independent from
-- tables that older environments created manually in the dashboard.
CREATE TABLE IF NOT EXISTS public.ranked_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  username text NOT NULL DEFAULT '',
  preferred_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  rank_points int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.ranked_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id text NOT NULL,
  player1_name text NOT NULL DEFAULT '',
  player2_id text NOT NULL,
  player2_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'mix',
  status text NOT NULL DEFAULT 'active',
  current_question_index int NOT NULL DEFAULT 0,
  question_start_time bigint,
  countdown_start bigint,
  player1_score int NOT NULL DEFAULT 0,
  player2_score int NOT NULL DEFAULT 0,
  player1_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  player2_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  winner_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Keep the additions compatible with both the original and current shapes.
ALTER TABLE public.ranked_queue
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS current_question_index int NOT NULL DEFAULT 0;
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS question_start_time bigint;
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS countdown_start bigint;
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS player1_answers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS player2_answers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;
ALTER TABLE public.ranked_matches
  ADD COLUMN IF NOT EXISTS question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

DELETE FROM public.ranked_queue AS duplicate
USING public.ranked_queue AS keeper
WHERE duplicate.user_id = keeper.user_id
  AND duplicate.id <> keeper.id
  AND (duplicate.created_at, duplicate.id) < (keeper.created_at, keeper.id);
CREATE UNIQUE INDEX IF NOT EXISTS ranked_queue_user_id_key
  ON public.ranked_queue (user_id);
WITH duplicated_active_pairs AS (
  SELECT id, row_number() OVER (
    PARTITION BY least(player1_id, player2_id), greatest(player1_id, player2_id)
    ORDER BY created_at DESC, id DESC
  ) AS position
  FROM public.ranked_matches
  WHERE status = 'active'
)
UPDATE public.ranked_matches AS rm
SET status = 'cancelled'
FROM duplicated_active_pairs AS duplicate
WHERE rm.id = duplicate.id AND duplicate.position > 1;
CREATE UNIQUE INDEX IF NOT EXISTS ranked_matches_active_pair_key
  ON public.ranked_matches (
    least(player1_id, player2_id),
    greatest(player1_id, player2_id)
  )
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.ranked_answers (
  match_id uuid NOT NULL REFERENCES public.ranked_matches(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  question_index int NOT NULL,
  question_id int NOT NULL,
  answer_text text,
  correct boolean NOT NULL,
  points int NOT NULL,
  answered_at bigint NOT NULL,
  PRIMARY KEY (match_id, user_id, question_index)
);

CREATE TABLE IF NOT EXISTS public.ranked_active_players (
  user_id text PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.ranked_matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.daily_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  challenge_date date NOT NULL DEFAULT current_date,
  display_name text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  current_question_index int NOT NULL DEFAULT 0,
  question_started_at bigint NOT NULL
    DEFAULT (floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint),
  score int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  UNIQUE (user_id, challenge_date)
);

CREATE TABLE IF NOT EXISTS public.daily_answers (
  attempt_id uuid NOT NULL REFERENCES public.daily_attempts(id) ON DELETE CASCADE,
  question_index int NOT NULL,
  question_id int NOT NULL,
  answer_text text,
  correct boolean NOT NULL,
  points int NOT NULL,
  answered_at bigint NOT NULL,
  PRIMARY KEY (attempt_id, question_index),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.game_reward_events (
  user_id text NOT NULL,
  event_key text NOT NULL,
  xp int NOT NULL,
  coins int NOT NULL,
  season_points int NOT NULL,
  won boolean,
  correct_count int NOT NULL,
  newly_unlocked text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, event_key)
);
ALTER TABLE public.game_reward_events
  ADD COLUMN IF NOT EXISTS newly_unlocked text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.guest_game_identities (
  user_id text PRIMARY KEY,
  token_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.daily_attempts
  ADD COLUMN IF NOT EXISTS question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Older dashboard-created game tables used uuid user identifiers.  The
-- authoritative game contract accepts both registered ids and guest ids
-- (guest_<stable-id>), so normalize legacy user-id columns to text before
-- compiling/running the RPCs below.  Existing UUID values are preserved as
-- their canonical text representation.
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ranked_queue'
    AND column_name = 'user_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.ranked_queue
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ranked_matches'
    AND column_name = 'player1_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.ranked_matches
      ALTER COLUMN player1_id TYPE text USING player1_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ranked_matches'
    AND column_name = 'player2_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.ranked_matches
      ALTER COLUMN player2_id TYPE text USING player2_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ranked_matches'
    AND column_name = 'winner_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.ranked_matches
      ALTER COLUMN winner_id TYPE text USING winner_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ranked_answers'
    AND column_name = 'user_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.ranked_answers
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ranked_active_players'
    AND column_name = 'user_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.ranked_active_players
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'daily_attempts'
    AND column_name = 'user_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.daily_attempts
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'game_reward_events'
    AND column_name = 'user_id';
  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.game_reward_events
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END;
$$;

-- Active records from the pre-authoritative client cannot be trusted because
-- they have no immutable server-selected question set.
UPDATE public.ranked_matches
SET status = 'cancelled'
WHERE status = 'active' AND jsonb_array_length(question_ids) <> 10;
DELETE FROM public.daily_attempts
WHERE status = 'active' AND jsonb_array_length(question_ids) <> 10;

DROP FUNCTION IF EXISTS public.assert_game_user(text);
CREATE OR REPLACE FUNCTION public.assert_game_user(p_user_id text, p_guest_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_user_id IS NULL OR length(p_user_id) > 100 THEN
    RAISE EXCEPTION 'Invalid game user';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id::text = p_user_id
      AND u.auth_id::text = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Game user does not belong to caller';
  END IF;
  IF auth.uid() IS NULL THEN
    IF (
         p_user_id !~ '^guest_[0-9A-Za-z-]{8,80}$'
         AND (
           p_user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR EXISTS (SELECT 1 FROM public.users AS u WHERE u.id::text = p_user_id)
         )
       )
       OR p_guest_token IS NULL OR length(p_guest_token) < 32 THEN
      RAISE EXCEPTION 'Anonymous callers require a guest capability';
    END IF;
    INSERT INTO public.guest_game_identities (user_id, token_hash)
    VALUES (p_user_id, extensions.digest(p_guest_token, 'sha256'))
    ON CONFLICT (user_id) DO NOTHING;
    IF NOT EXISTS (
      SELECT 1 FROM public.guest_game_identities AS gi
      WHERE gi.user_id = p_user_id
        AND gi.token_hash = extensions.digest(p_guest_token, 'sha256')
    ) THEN
      RAISE EXCEPTION 'Invalid guest capability';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_game_reward_v2(
  p_user_id text,
  p_event_key text,
  p_xp int,
  p_coins int,
  p_season_points int,
  p_won boolean,
  p_correct_count int,
  p_mode text
)
RETURNS TABLE(
  applied boolean, xp_gained int, coins_gained int,
  new_xp int, new_coins int, new_level int, newly_unlocked text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_bonus int := 0;
  v_new_xp int;
  v_new_coins int;
  v_level int;
  v_today date := current_date;
  v_progress jsonb;
  v_achievements jsonb;
  v_event public.game_reward_events%ROWTYPE;
  v_newly_unlocked text[] := '{}'::text[];
  v_bonus_xp int := 0;
  v_bonus_coins int := 0;
BEGIN
  IF p_xp < 0 OR p_coins < 0 OR p_correct_count < 0
     OR p_mode NOT IN ('ranked', 'daily', 'challenge', 'survival') THEN
    RAISE EXCEPTION 'Invalid reward';
  END IF;

  INSERT INTO public.game_reward_events (
    user_id, event_key, xp, coins, season_points, won, correct_count
  ) VALUES (
    p_user_id, p_event_key, p_xp, p_coins, p_season_points, p_won, p_correct_count
  )
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_event
    FROM public.game_reward_events AS event
    WHERE event.user_id = p_user_id AND event.event_key = p_event_key;
    SELECT * INTO v_user FROM public.users AS u WHERE u.id::text = p_user_id;
    RETURN QUERY SELECT false, coalesce(v_event.xp, 0), coalesce(v_event.coins, 0),
      coalesce(v_user.xp, 0), coalesce(v_user.coins, 0),
      coalesce(v_user.level, 1), coalesce(v_event.newly_unlocked, '{}'::text[]);
    RETURN;
  END IF;

  SELECT * INTO v_user
  FROM public.users AS u
  WHERE u.id::text = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    -- Guests have leaderboard results but no persistent currency profile.
    RETURN QUERY SELECT true, 0, 0, 0, 0, 1, '{}'::text[];
    RETURN;
  END IF;

  IF v_user.last_played::date IS DISTINCT FROM v_today THEN
    v_bonus := 15;
  END IF;
  v_new_xp := coalesce(v_user.xp, 0) + p_xp;
  v_new_coins := coalesce(v_user.coins, 0) + p_coins + v_bonus;
  v_level := CASE
    WHEN v_new_xp >= 8000 THEN 7 WHEN v_new_xp >= 4000 THEN 6
    WHEN v_new_xp >= 2000 THEN 5 WHEN v_new_xp >= 1000 THEN 4
    WHEN v_new_xp >= 500 THEN 3 WHEN v_new_xp >= 200 THEN 2 ELSE 1
  END;
  v_achievements := coalesce(v_user.achievements, '{}'::jsonb);
  v_progress := coalesce(v_achievements->'progress', '{}'::jsonb);
  v_progress := jsonb_set(v_progress, '{total_games}',
    to_jsonb(coalesce((v_progress->>'total_games')::int, 0) + 1), true);
  v_progress := jsonb_set(v_progress, '{total_correct}',
    to_jsonb(coalesce((v_progress->>'total_correct')::int, 0) + p_correct_count), true);
  v_progress := jsonb_set(v_progress, '{level}', to_jsonb(v_level), true);
  IF p_mode = 'ranked' AND p_won THEN
    v_progress := jsonb_set(v_progress, '{ranked_wins}',
      to_jsonb(coalesce((v_progress->>'ranked_wins')::int, 0) + 1), true);
    v_progress := jsonb_set(v_progress, '{consecutive_wins}',
      to_jsonb(coalesce((v_progress->>'consecutive_wins')::int, 0) + 1), true);
  ELSIF p_mode = 'ranked' AND NOT coalesce(p_won, false) THEN
    v_progress := jsonb_set(v_progress, '{consecutive_wins}', '0'::jsonb, true);
  END IF;
  IF p_mode = 'challenge' THEN
    v_progress := jsonb_set(v_progress, '{consecutive_wins}',
      to_jsonb(CASE WHEN p_won IS TRUE
        THEN coalesce((v_progress->>'consecutive_wins')::int, 0) + 1
        ELSE 0 END), true);
  END IF;
  IF p_mode = 'survival' AND p_won IS TRUE THEN
    v_progress := jsonb_set(v_progress, '{survival_wins}',
      to_jsonb(coalesce((v_progress->>'survival_wins')::int, 0) + 1), true);
  END IF;
  v_progress := jsonb_set(v_progress, '{streak_count}',
    to_jsonb(CASE
      WHEN v_user.last_played::date = v_today THEN coalesce(v_user.streak_count, 0)
      WHEN v_user.last_played::date = v_today - 1 THEN coalesce(v_user.streak_count, 0) + 1
      ELSE 1 END), true);
  IF coalesce((v_progress->>'total_games')::int, 0) >= 1
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'first_game') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'first_game');
    v_bonus_xp := v_bonus_xp + 50; v_bonus_coins := v_bonus_coins + 20;
  END IF;
  IF coalesce((v_progress->>'total_correct')::int, 0) >= 50
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'correct_50') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'correct_50');
    v_bonus_xp := v_bonus_xp + 80; v_bonus_coins := v_bonus_coins + 40;
  END IF;
  IF coalesce((v_progress->>'survival_wins')::int, 0) >= 3
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'survival_top_3') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'survival_top_3');
    v_bonus_xp := v_bonus_xp + 100; v_bonus_coins := v_bonus_coins + 50;
  END IF;
  IF coalesce((v_progress->>'ranked_wins')::int, 0) >= 25
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'ranked_25') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'ranked_25');
    v_bonus_xp := v_bonus_xp + 250; v_bonus_coins := v_bonus_coins + 125;
  END IF;
  IF coalesce((v_progress->>'streak_count')::int, 0) >= 7
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'play_7_days') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'play_7_days');
    v_bonus_xp := v_bonus_xp + 100; v_bonus_coins := v_bonus_coins + 50;
  END IF;
  IF coalesce((v_progress->>'streak_count')::int, 0) >= 30
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'play_30_days') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'play_30_days');
    v_bonus_xp := v_bonus_xp + 500; v_bonus_coins := v_bonus_coins + 200;
  END IF;
  IF coalesce((v_progress->>'level')::int, 0) >= 6
     AND NOT (coalesce(v_achievements->'unlocked', '[]'::jsonb) ? 'reach_level_6') THEN
    v_newly_unlocked := array_append(v_newly_unlocked, 'reach_level_6');
    v_bonus_xp := v_bonus_xp + 300; v_bonus_coins := v_bonus_coins + 150;
  END IF;
  IF cardinality(v_newly_unlocked) > 0 THEN
    v_achievements := jsonb_set(
      v_achievements,
      '{unlocked}',
      coalesce(v_achievements->'unlocked', '[]'::jsonb) || to_jsonb(v_newly_unlocked),
      true
    );
  END IF;
  v_new_xp := v_new_xp + v_bonus_xp;
  v_new_coins := v_new_coins + v_bonus_coins;
  v_level := CASE
    WHEN v_new_xp >= 8000 THEN 7 WHEN v_new_xp >= 4000 THEN 6
    WHEN v_new_xp >= 2000 THEN 5 WHEN v_new_xp >= 1000 THEN 4
    WHEN v_new_xp >= 500 THEN 3 WHEN v_new_xp >= 200 THEN 2 ELSE 1
  END;
  v_progress := jsonb_set(v_progress, '{level}', to_jsonb(v_level), true);
  v_achievements := jsonb_set(v_achievements, '{progress}', v_progress, true);
  v_achievements := jsonb_set(v_achievements, '{progress}', v_progress, true);

  UPDATE public.users AS u
  SET xp = v_new_xp,
      coins = v_new_coins,
      level = v_level,
      season_points = CASE WHEN p_mode IN ('ranked', 'daily')
        THEN greatest(0, coalesce(u.season_points, 0) + p_season_points)
        ELSE coalesce(u.season_points, 0) END,
      total_wins = coalesce(u.total_wins, 0) + CASE WHEN p_won IS TRUE THEN 1 ELSE 0 END,
      total_losses = coalesce(u.total_losses, 0) + CASE WHEN p_won = false THEN 1 ELSE 0 END,
      total_points = coalesce(u.total_points, 0) + greatest(0, p_season_points),
      streak_count = CASE
        WHEN u.last_played::date = v_today THEN coalesce(u.streak_count, 0)
        WHEN u.last_played::date = v_today - 1 THEN coalesce(u.streak_count, 0) + 1
        ELSE 1
      END,
      longest_streak = greatest(
        coalesce(u.longest_streak, 0),
        CASE
          WHEN u.last_played::date = v_today THEN coalesce(u.streak_count, 0)
          WHEN u.last_played::date = v_today - 1 THEN coalesce(u.streak_count, 0) + 1
          ELSE 1
        END
      ),
      last_played = v_today::text,
      achievements = v_achievements
  WHERE u.id::text = p_user_id;

  UPDATE public.game_reward_events AS event
  SET xp = p_xp + v_bonus_xp,
      coins = p_coins + v_bonus + v_bonus_coins,
      newly_unlocked = v_newly_unlocked
  WHERE event.user_id = p_user_id AND event.event_key = p_event_key;

  RETURN QUERY SELECT true, p_xp + v_bonus_xp, p_coins + v_bonus + v_bonus_coins,
    v_new_xp, v_new_coins, v_level, v_newly_unlocked;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_game_reward(
  p_user_id text,
  p_event_key text,
  p_xp int,
  p_coins int,
  p_season_points int,
  p_won boolean,
  p_correct_count int,
  p_mode text
)
RETURNS TABLE(
  applied boolean, xp_gained int, coins_gained int,
  new_xp int, new_coins int, new_level int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT reward.applied, reward.xp_gained, reward.coins_gained,
    reward.new_xp, reward.new_coins, reward.new_level
  FROM public.apply_game_reward_v2(
    p_user_id, p_event_key, p_xp, p_coins, p_season_points,
    p_won, p_correct_count, p_mode
  ) AS reward;
$$;

DROP FUNCTION IF EXISTS public.enter_ranked_queue(text,text,jsonb);
CREATE OR REPLACE FUNCTION public.enter_ranked_queue(
  p_user_id text,
  p_username text,
  p_preferred_categories jsonb,
  p_guest_token text
)
RETURNS SETOF public.ranked_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_opponent public.ranked_queue%ROWTYPE;
  v_existing public.ranked_matches%ROWTYPE;
  v_category text := 'mix';
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_match_id uuid := gen_random_uuid();
  v_question_ids jsonb;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  IF p_username IS NULL OR length(trim(p_username)) = 0 OR length(p_username) > 80
     OR jsonb_typeof(coalesce(p_preferred_categories, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid ranked queue request';
  END IF;

  SELECT * INTO v_existing
  FROM public.ranked_matches AS rm
  WHERE rm.status = 'active'
    AND p_user_id IN (rm.player1_id, rm.player2_id)
  ORDER BY rm.created_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN NEXT v_existing; RETURN; END IF;

  INSERT INTO public.ranked_queue (
    user_id, username, preferred_categories, status, created_at, last_seen_at
  ) VALUES (
    p_user_id, trim(p_username), coalesce(p_preferred_categories, '[]'::jsonb),
    'waiting', clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    username = excluded.username,
    preferred_categories = excluded.preferred_categories,
    status = 'waiting',
    created_at = excluded.created_at,
    last_seen_at = excluded.last_seen_at;

  PERFORM 1 FROM public.ranked_queue AS rq
  WHERE rq.user_id = p_user_id FOR UPDATE;
  SELECT * INTO v_existing
  FROM public.ranked_matches AS rm
  WHERE rm.status = 'active'
    AND p_user_id IN (rm.player1_id, rm.player2_id)
  ORDER BY rm.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.ranked_queue SET status = 'matched'
    WHERE user_id = p_user_id;
    RETURN NEXT v_existing;
    RETURN;
  END IF;
  SELECT * INTO v_opponent
  FROM public.ranked_queue AS rq
  WHERE rq.status = 'waiting' AND rq.user_id <> p_user_id
  ORDER BY rq.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT value #>> '{}' INTO v_category
  FROM jsonb_array_elements(coalesce(p_preferred_categories, '[]'::jsonb)) AS value
  WHERE coalesce(v_opponent.preferred_categories, '[]'::jsonb) ? (value #>> '{}')
  LIMIT 1;
  v_category := coalesce(v_category, 'mix');
  SELECT coalesce(jsonb_agg(selected.id ORDER BY selected.position), '[]'::jsonb)
  INTO v_question_ids
  FROM (
    SELECT q.id, row_number() OVER (
      ORDER BY md5(v_match_id::text || ':' || q.id::text)
    ) AS position
    FROM public.questions AS q
    WHERE (v_category = 'mix' AND q.category <> 'legends')
       OR q.category = v_category
    ORDER BY md5(v_match_id::text || ':' || q.id::text)
    LIMIT 10
  ) AS selected;
  IF jsonb_array_length(v_question_ids) < 10 THEN
    RAISE EXCEPTION 'Not enough ranked questions';
  END IF;

  INSERT INTO public.ranked_matches (
    id, player1_id, player1_name, player2_id, player2_name, category, status,
    current_question_index, question_start_time, countdown_start,
    player1_score, player2_score, player1_answers, player2_answers, winner_id,
    question_ids
  ) VALUES (
    v_match_id,
    least(p_user_id, v_opponent.user_id),
    CASE WHEN p_user_id < v_opponent.user_id THEN trim(p_username) ELSE v_opponent.username END,
    greatest(p_user_id, v_opponent.user_id),
    CASE WHEN p_user_id < v_opponent.user_id THEN v_opponent.username ELSE trim(p_username) END,
    v_category, 'active', 0, NULL, v_now, 0, 0, '[]'::jsonb, '[]'::jsonb, NULL,
    v_question_ids
  )
  RETURNING * INTO v_existing;
  INSERT INTO public.ranked_active_players (user_id, match_id)
  VALUES
    (v_existing.player1_id, v_existing.id),
    (v_existing.player2_id, v_existing.id);
  UPDATE public.ranked_queue SET status = 'matched'
  WHERE user_id IN (p_user_id, v_opponent.user_id);
  RETURN NEXT v_existing;
END;
$$;

DROP FUNCTION IF EXISTS public.cancel_ranked_queue(text);
CREATE OR REPLACE FUNCTION public.cancel_ranked_queue(p_user_id text, p_guest_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  UPDATE public.ranked_queue SET status = 'cancelled', last_seen_at = clock_timestamp()
  WHERE user_id = p_user_id AND status = 'waiting';
  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.start_or_advance_ranked_match(uuid,text,int);
CREATE OR REPLACE FUNCTION public.start_or_advance_ranked_match(
  p_match_id uuid, p_user_id text, p_from_question int, p_guest_token text
)
RETURNS SETOF public.ranked_matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_match public.ranked_matches%ROWTYPE;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_answer_count int;
  v_winner text;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT * INTO v_match FROM public.ranked_matches AS rm
  WHERE rm.id = p_match_id FOR UPDATE;
  IF NOT FOUND OR p_user_id NOT IN (v_match.player1_id, v_match.player2_id)
     OR v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Invalid ranked advance';
  END IF;
  IF p_from_question = -1 AND v_match.question_start_time IS NULL THEN
    UPDATE public.ranked_matches
    SET current_question_index = 0, question_start_time = v_now
    WHERE id = p_match_id RETURNING * INTO v_match;
    RETURN NEXT v_match; RETURN;
  END IF;
  IF p_from_question <> v_match.current_question_index THEN
    RETURN NEXT v_match; RETURN;
  END IF;
  SELECT count(*) INTO v_answer_count FROM public.ranked_answers AS ra
  WHERE ra.match_id = p_match_id AND ra.question_index = p_from_question;
  IF v_answer_count < 2
     AND v_now <= coalesce(v_match.question_start_time, v_now) + 10500 THEN
    RETURN NEXT v_match; RETURN;
  END IF;
  IF p_from_question < 9 THEN
    UPDATE public.ranked_matches
    SET current_question_index = p_from_question + 1, question_start_time = v_now
    WHERE id = p_match_id RETURNING * INTO v_match;
    RETURN NEXT v_match; RETURN;
  END IF;

  v_winner := CASE
    WHEN v_match.player1_score > v_match.player2_score THEN v_match.player1_id
    WHEN v_match.player2_score > v_match.player1_score THEN v_match.player2_id
    ELSE NULL
  END;
  UPDATE public.ranked_matches
  SET status = 'finished', winner_id = v_winner, settled_at = clock_timestamp()
  WHERE id = p_match_id AND settled_at IS NULL
  RETURNING * INTO v_match;
  IF FOUND THEN
    DELETE FROM public.ranked_active_players WHERE match_id = p_match_id;
    UPDATE public.ranked_queue
    SET rank_points = greatest(0, coalesce(rank_points, 0) +
      CASE WHEN user_id = v_winner THEN 20 WHEN v_winner IS NULL THEN 0 ELSE -20 END),
      status = 'finished'
    WHERE user_id IN (v_match.player1_id, v_match.player2_id);
    PERFORM public.apply_game_reward(
      v_match.player1_id, 'ranked:' || p_match_id::text,
      CASE WHEN v_winner = v_match.player1_id THEN 40 WHEN v_winner IS NULL THEN 15 ELSE 5 END,
      CASE WHEN v_winner = v_match.player1_id THEN 30 ELSE 0 END,
      CASE WHEN v_winner = v_match.player1_id THEN 20 WHEN v_winner IS NULL THEN 5 ELSE 0 END,
      CASE WHEN v_winner IS NULL THEN NULL ELSE v_winner = v_match.player1_id END,
      (SELECT count(*)::int FROM public.ranked_answers WHERE match_id = p_match_id
        AND user_id = v_match.player1_id AND correct),
      'ranked'
    );
    PERFORM public.apply_game_reward(
      v_match.player2_id, 'ranked:' || p_match_id::text,
      CASE WHEN v_winner = v_match.player2_id THEN 40 WHEN v_winner IS NULL THEN 15 ELSE 5 END,
      CASE WHEN v_winner = v_match.player2_id THEN 30 ELSE 0 END,
      CASE WHEN v_winner = v_match.player2_id THEN 20 WHEN v_winner IS NULL THEN 5 ELSE 0 END,
      CASE WHEN v_winner IS NULL THEN NULL ELSE v_winner = v_match.player2_id END,
      (SELECT count(*)::int FROM public.ranked_answers WHERE match_id = p_match_id
        AND user_id = v_match.player2_id AND correct),
      'ranked'
    );
  ELSE
    SELECT * INTO v_match FROM public.ranked_matches WHERE id = p_match_id;
  END IF;
  RETURN NEXT v_match;
END;
$$;

DROP FUNCTION IF EXISTS public.submit_ranked_answer(uuid,text,int,int,text);
CREATE OR REPLACE FUNCTION public.submit_ranked_answer(
  p_match_id uuid, p_user_id text, p_question_index int,
  p_question_id int, p_answer_text text, p_guest_token text
)
RETURNS SETOF public.ranked_matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_match public.ranked_matches%ROWTYPE;
  v_correct boolean := false;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_elapsed bigint;
  v_points int := 0;
  v_entry jsonb;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT * INTO v_match FROM public.ranked_matches AS rm
  WHERE rm.id = p_match_id FOR UPDATE;
  IF NOT FOUND OR p_user_id NOT IN (v_match.player1_id, v_match.player2_id)
     OR v_match.status <> 'active'
     OR v_match.current_question_index <> p_question_index
     OR v_match.question_start_time IS NULL
     OR (v_match.question_ids->>p_question_index)::int IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Invalid ranked answer';
  END IF;
  v_elapsed := greatest(0, v_now - v_match.question_start_time);
  IF v_elapsed <= 10500 AND p_answer_text IS NOT NULL THEN
    SELECT (q.options->>q.correct) = p_answer_text INTO v_correct
    FROM public.questions AS q WHERE q.id = p_question_id;
  END IF;
  IF coalesce(v_correct, false) THEN
    v_points := CASE
      WHEN v_elapsed <= 2000 THEN 10 WHEN v_elapsed <= 4000 THEN 8
      WHEN v_elapsed <= 6000 THEN 6 WHEN v_elapsed <= 8000 THEN 4 ELSE 2
    END;
  END IF;
  INSERT INTO public.ranked_answers (
    match_id, user_id, question_index, question_id, answer_text,
    correct, points, answered_at
  ) VALUES (
    p_match_id, p_user_id, p_question_index, p_question_id, p_answer_text,
    coalesce(v_correct, false), v_points, v_now
  ) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    v_entry := jsonb_build_object(
      'ans', p_answer_text, 'pts', v_points, 'ms', v_elapsed,
      'correct', coalesce(v_correct, false)
    );
    IF p_user_id = v_match.player1_id THEN
      UPDATE public.ranked_matches
      SET player1_answers = jsonb_set(player1_answers, ARRAY[p_question_index::text], v_entry, true),
          player1_score = player1_score + v_points
      WHERE id = p_match_id RETURNING * INTO v_match;
    ELSE
      UPDATE public.ranked_matches
      SET player2_answers = jsonb_set(player2_answers, ARRAY[p_question_index::text], v_entry, true),
          player2_score = player2_score + v_points
      WHERE id = p_match_id RETURNING * INTO v_match;
    END IF;
  ELSE
    SELECT * INTO v_match FROM public.ranked_matches WHERE id = p_match_id;
  END IF;
  RETURN NEXT v_match;
END;
$$;

DROP FUNCTION IF EXISTS public.start_daily_attempt(text,text,text);
CREATE OR REPLACE FUNCTION public.start_daily_attempt(
  p_user_id text, p_display_name text, p_country text, p_guest_token text
)
RETURNS SETOF public.daily_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_attempt public.daily_attempts%ROWTYPE;
  v_question_ids jsonb;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT jsonb_agg(chosen.id ORDER BY chosen.bucket, chosen.position)
  INTO v_question_ids
  FROM (
    SELECT ranked.id, ranked.bucket, ranked.position
    FROM (
      SELECT q.id, q.difficulty AS bucket,
        row_number() OVER (
          PARTITION BY q.difficulty
          ORDER BY md5(current_date::text || ':' || q.id::text)
        ) AS position
      FROM public.questions AS q
      WHERE q.category <> 'legends' AND q.difficulty IN ('easy', 'medium', 'hard')
    ) AS ranked
    WHERE (ranked.bucket = 'easy' AND ranked.position <= 4)
       OR (ranked.bucket = 'medium' AND ranked.position <= 4)
       OR (ranked.bucket = 'hard' AND ranked.position <= 2)
  ) AS chosen;
  IF jsonb_array_length(coalesce(v_question_ids, '[]'::jsonb)) < 10 THEN
    RAISE EXCEPTION 'Not enough daily questions';
  END IF;
  INSERT INTO public.daily_attempts (
    user_id, challenge_date, display_name, country, question_ids
  ) VALUES (
    p_user_id, current_date, left(coalesce(p_display_name, ''), 80),
    left(coalesce(p_country, ''), 10), v_question_ids
  ) ON CONFLICT (user_id, challenge_date) DO NOTHING
  RETURNING * INTO v_attempt;
  IF NOT FOUND THEN
    SELECT * INTO v_attempt FROM public.daily_attempts
    WHERE user_id = p_user_id AND challenge_date = current_date;
  END IF;
  RETURN NEXT v_attempt;
END;
$$;

DROP FUNCTION IF EXISTS public.submit_daily_answer(uuid,text,int,int,text);
CREATE OR REPLACE FUNCTION public.submit_daily_answer(
  p_attempt_id uuid, p_user_id text, p_question_index int,
  p_question_id int, p_answer_text text, p_guest_token text
)
RETURNS SETOF public.daily_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_attempt public.daily_attempts%ROWTYPE;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_elapsed bigint;
  v_correct boolean := false;
  v_points int := 0;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT * INTO v_attempt FROM public.daily_attempts AS da
  WHERE da.id = p_attempt_id AND da.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid daily answer';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.daily_answers AS answer
    WHERE answer.attempt_id = p_attempt_id
      AND answer.question_index = p_question_index
  ) THEN
    RETURN NEXT v_attempt;
    RETURN;
  END IF;
  IF v_attempt.status <> 'active'
     OR v_attempt.current_question_index <> p_question_index
     OR (v_attempt.question_ids->>p_question_index)::int IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Invalid daily answer';
  END IF;
  v_elapsed := greatest(0, v_now - v_attempt.question_started_at);
  IF v_elapsed <= 15500 AND p_answer_text IS NOT NULL THEN
    SELECT (q.options->>q.correct) = p_answer_text INTO v_correct
    FROM public.questions AS q WHERE q.id = p_question_id;
  END IF;
  IF coalesce(v_correct, false) THEN
    v_points := 100 + round(50 * greatest(0, (15000 - v_elapsed)::numeric / 14000))::int;
  END IF;
  INSERT INTO public.daily_answers (
    attempt_id, question_index, question_id, answer_text, correct, points, answered_at
  ) VALUES (
    p_attempt_id, p_question_index, p_question_id, p_answer_text,
    coalesce(v_correct, false), v_points, v_now
  ) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.daily_attempts
    SET score = score + v_points,
        correct_count = correct_count + CASE WHEN v_correct THEN 1 ELSE 0 END,
        current_question_index = current_question_index + 1,
        question_started_at = v_now,
        status = CASE WHEN p_question_index >= 9 THEN 'completed' ELSE status END,
        completed_at = CASE WHEN p_question_index >= 9 THEN clock_timestamp() ELSE completed_at END
    WHERE id = p_attempt_id RETURNING * INTO v_attempt;
    IF p_question_index >= 9 THEN
      INSERT INTO public.daily_scores (
        user_id, display_name, country, score, total, date, completed_at
      ) VALUES (
        p_user_id, v_attempt.display_name, v_attempt.country, v_attempt.score,
        10, v_attempt.challenge_date, v_attempt.completed_at
      ) ON CONFLICT (user_id, date) DO NOTHING;
      PERFORM public.apply_game_reward(
        p_user_id, 'daily:' || v_attempt.challenge_date::text,
        20, 15, 0, v_attempt.correct_count >= 7, v_attempt.correct_count, 'daily'
      );
    END IF;
  ELSE
    SELECT * INTO v_attempt FROM public.daily_attempts WHERE id = p_attempt_id;
  END IF;
  RETURN NEXT v_attempt;
END;
$$;

-- Challenge and Survival settlement share the same user-row lock and event
-- ledger as Ranked and Daily. Engagement is updated only when the reward event
-- is newly applied, so a lost response can be retried without double progress.
CREATE OR REPLACE FUNCTION public.apply_game_engagement(
  p_user_id text,
  p_won boolean,
  p_correct_count int,
  p_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_achievements jsonb;
  v_engagement jsonb;
  v_daily jsonb;
  v_weekly jsonb;
  v_box jsonb;
  v_categories jsonb;
  v_category_state jsonb;
  v_today text := current_date::text;
  v_week text := to_char(current_date, 'IYYY-"W"IW');
  v_games_since int;
  v_pending int;
BEGIN
  SELECT * INTO v_user
  FROM public.users AS u
  WHERE u.id::text = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_achievements := coalesce(v_user.achievements, '{}'::jsonb);
  v_engagement := coalesce(v_achievements->'engagement', '{}'::jsonb);
  v_daily := coalesce(v_engagement->'daily', '{}'::jsonb);
  IF v_daily->>'date' IS DISTINCT FROM v_today THEN
    v_daily := jsonb_build_object(
      'date', v_today, 'games', 0, 'wins', 0, 'correct', 0, 'claimed', '[]'::jsonb
    );
  END IF;
  v_daily := jsonb_set(v_daily, '{games}',
    to_jsonb(coalesce((v_daily->>'games')::int, 0) + 1), true);
  v_daily := jsonb_set(v_daily, '{wins}',
    to_jsonb(coalesce((v_daily->>'wins')::int, 0) + CASE WHEN p_won IS TRUE THEN 1 ELSE 0 END), true);
  v_daily := jsonb_set(v_daily, '{correct}',
    to_jsonb(coalesce((v_daily->>'correct')::int, 0) + p_correct_count), true);

  v_weekly := coalesce(v_engagement->'weekly', '{}'::jsonb);
  IF v_weekly->>'week' IS DISTINCT FROM v_week THEN
    v_weekly := jsonb_build_object('week', v_week, 'correct', 0, 'claimed', false);
  END IF;
  v_weekly := jsonb_set(v_weekly, '{correct}',
    to_jsonb(coalesce((v_weekly->>'correct')::int, 0) + p_correct_count), true);

  v_box := coalesce(v_engagement->'box', '{}'::jsonb);
  v_games_since := coalesce((v_box->>'gamesSince')::int, 0) + 1;
  v_pending := coalesce((v_box->>'pending')::int, 0) + (v_games_since / 5);
  v_games_since := v_games_since % 5;
  v_box := jsonb_set(v_box, '{gamesSince}', to_jsonb(v_games_since), true);
  v_box := jsonb_set(v_box, '{pending}', to_jsonb(v_pending), true);

  v_categories := coalesce(v_engagement->'categories', '{}'::jsonb);
  IF p_category IS NOT NULL AND p_category <> '' AND p_category <> 'mix'
     AND p_correct_count > 0 THEN
    v_category_state := coalesce(v_categories->p_category, '{}'::jsonb);
    v_category_state := jsonb_set(v_category_state, '{xp}',
      to_jsonb(coalesce((v_category_state->>'xp')::int, 0) + p_correct_count * 10), true);
    v_categories := jsonb_set(v_categories, ARRAY[p_category], v_category_state, true);
  END IF;

  v_engagement := jsonb_set(v_engagement, '{daily}', v_daily, true);
  v_engagement := jsonb_set(v_engagement, '{weekly}', v_weekly, true);
  v_engagement := jsonb_set(v_engagement, '{box}', v_box, true);
  v_engagement := jsonb_set(v_engagement, '{categories}', v_categories, true);
  v_achievements := jsonb_set(v_achievements, '{engagement}', v_engagement, true);
  UPDATE public.users SET achievements = v_achievements
  WHERE id::text = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_challenge_game(uuid,text,text,text,int,text);
CREATE OR REPLACE FUNCTION public.create_challenge_game(
  p_challenge_id uuid,
  p_creator_id text,
  p_creator_name text,
  p_category text,
  p_question_count int,
  p_guest_token text
)
RETURNS SETOF public.challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_question_ids jsonb;
BEGIN
  PERFORM public.assert_game_user(p_creator_id, p_guest_token);
  IF p_question_count NOT IN (5, 10, 15, 20)
     OR p_creator_name IS NULL OR length(trim(p_creator_name)) = 0 THEN
    RAISE EXCEPTION 'Invalid challenge creation';
  END IF;
  SELECT jsonb_agg(chosen.id ORDER BY chosen.position)
  INTO v_question_ids
  FROM (
    SELECT q.id, row_number() OVER (ORDER BY extensions.gen_random_bytes(8)) AS position
    FROM public.questions AS q
    WHERE q.category = p_category
    LIMIT p_question_count
  ) AS chosen;
  IF jsonb_array_length(coalesce(v_question_ids, '[]'::jsonb)) <> p_question_count THEN
    RAISE EXCEPTION 'Not enough challenge questions';
  END IF;
  INSERT INTO public.challenges (
    id, creator_id, creator_name, category, question_ids,
    creator_answers, creator_score, question_count, status
  ) VALUES (
    p_challenge_id, p_creator_id::uuid, left(trim(p_creator_name), 80), p_category,
    v_question_ids::text, '[]', 0, p_question_count, 'pending'
  ) RETURNING * INTO v_challenge;
  RETURN NEXT v_challenge;
END;
$$;

DROP FUNCTION IF EXISTS public.submit_challenge_game_result(uuid,text,text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.submit_challenge_game_result(
  p_challenge_id uuid,
  p_user_id text,
  p_role text,
  p_player_name text,
  p_answers jsonb,
  p_guest_token text
)
RETURNS SETOF public.challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_answer jsonb;
  v_position bigint;
  v_question_ids jsonb;
  v_score int := 0;
  v_selected jsonb := '[]'::jsonb;
  v_correct boolean;
  v_winner text;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT * INTO v_challenge FROM public.challenges AS challenge
  WHERE challenge.id = p_challenge_id FOR UPDATE;
  IF NOT FOUND OR p_role NOT IN ('creator', 'challenger')
     OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Invalid challenge result';
  END IF;
  IF p_role = 'creator' AND v_challenge.creator_id::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Challenge creator does not belong to caller';
  END IF;
  IF p_role = 'challenger' AND v_challenge.opponent_id IS NOT NULL
     AND v_challenge.opponent_id::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Challenge opponent does not belong to caller';
  END IF;
  v_question_ids := v_challenge.question_ids::jsonb;
  IF jsonb_array_length(p_answers) IS DISTINCT FROM jsonb_array_length(v_question_ids) THEN
    RAISE EXCEPTION 'Incomplete challenge result';
  END IF;
  FOR v_answer, v_position IN
    SELECT value, ordinality FROM jsonb_array_elements(p_answers) WITH ORDINALITY
  LOOP
    IF (v_question_ids->>(v_position - 1)::int)::int
       IS DISTINCT FROM (v_answer->>'questionId')::int THEN
      RAISE EXCEPTION 'Invalid challenge answer sequence';
    END IF;
    SELECT (q.options->>q.correct) = (v_answer->>'answerText')
    INTO v_correct FROM public.questions AS q
    WHERE q.id = (v_answer->>'questionId')::int;
    IF coalesce(v_correct, false) THEN v_score := v_score + 1; END IF;
    v_selected := v_selected || jsonb_build_array(
      CASE WHEN v_answer->>'selectedIndex' IS NULL THEN NULL
        ELSE (v_answer->>'selectedIndex')::int END
    );
  END LOOP;
  IF p_role = 'creator' THEN
    IF v_challenge.status <> 'pending' THEN
      RAISE EXCEPTION 'Challenge creator result is already final';
    END IF;
    UPDATE public.challenges
    SET creator_answers = v_selected::text, creator_score = v_score,
        status = 'creator_completed'
    WHERE id = p_challenge_id RETURNING * INTO v_challenge;
  ELSE
    IF v_challenge.status = 'completed' THEN
      RETURN NEXT v_challenge; RETURN;
    END IF;
    IF v_challenge.status <> 'creator_completed' THEN
      RAISE EXCEPTION 'Challenge creator has not completed';
    END IF;
    v_winner := CASE
      WHEN v_score > coalesce(v_challenge.creator_score, 0) THEN 'opponent'
      WHEN v_score < coalesce(v_challenge.creator_score, 0) THEN 'creator'
      ELSE 'draw' END;
    UPDATE public.challenges
    SET opponent_id = p_user_id,
        opponent_name = left(coalesce(p_player_name, ''), 80),
        opponent_answers = v_selected::text,
        opponent_score = v_score,
        winner = v_winner,
        status = 'completed'
    WHERE id = p_challenge_id RETURNING * INTO v_challenge;
  END IF;
  RETURN NEXT v_challenge;
END;
$$;

DROP FUNCTION IF EXISTS public.delete_challenge_game(uuid,text,text);
CREATE OR REPLACE FUNCTION public.delete_challenge_game(
  p_challenge_id uuid,
  p_creator_id text,
  p_guest_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  PERFORM public.assert_game_user(p_creator_id, p_guest_token);
  DELETE FROM public.challenges AS challenge
  WHERE challenge.id = p_challenge_id
    AND challenge.creator_id::text = p_creator_id
    AND challenge.status IN ('pending', 'creator_completed');
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

DROP FUNCTION IF EXISTS public.settle_challenge_game(uuid,text,text,int,int,text);
CREATE OR REPLACE FUNCTION public.settle_challenge_game(
  p_challenge_id uuid,
  p_user_id text,
  p_role text,
  p_score int,
  p_correct_count int,
  p_guest_token text
)
RETURNS TABLE(
  applied boolean, xp_gained int, coins_gained int,
  new_xp int, new_coins int, new_level int, newly_unlocked text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_won boolean;
  v_expected_score int;
  v_expected_user text;
  v_username text;
  v_reward record;
  v_event_key text;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT * INTO v_challenge
  FROM public.challenges AS challenge
  WHERE challenge.id = p_challenge_id
  FOR UPDATE;
  IF NOT FOUND OR v_challenge.status <> 'completed'
     OR p_role NOT IN ('creator', 'challenger') THEN
    RAISE EXCEPTION 'Invalid challenge settlement';
  END IF;

  IF p_role = 'creator' THEN
    v_expected_user := v_challenge.creator_id::text;
    v_expected_score := coalesce(v_challenge.creator_score, 0);
    v_username := v_challenge.creator_name;
    v_won := CASE
      WHEN v_expected_score > coalesce(v_challenge.opponent_score, 0) THEN true
      WHEN v_expected_score < coalesce(v_challenge.opponent_score, 0) THEN false
      ELSE NULL END;
  ELSE
    v_expected_user := v_challenge.opponent_id::text;
    v_expected_score := coalesce(v_challenge.opponent_score, 0);
    v_username := v_challenge.opponent_name;
    v_won := CASE
      WHEN v_expected_score > coalesce(v_challenge.creator_score, 0) THEN true
      WHEN v_expected_score < coalesce(v_challenge.creator_score, 0) THEN false
      ELSE NULL END;
  END IF;
  IF v_expected_user IS DISTINCT FROM p_user_id
     OR p_score IS DISTINCT FROM v_expected_score
     OR p_correct_count IS DISTINCT FROM v_expected_score THEN
    RAISE EXCEPTION 'Challenge result does not belong to caller';
  END IF;

  v_event_key := 'challenge:' || p_challenge_id::text || ':' || p_role;
  SELECT * INTO v_reward FROM public.apply_game_reward_v2(
    p_user_id, v_event_key,
    CASE WHEN v_won IS TRUE THEN 50 ELSE 10 END,
    CASE WHEN v_won IS TRUE THEN 20 ELSE 0 END,
    v_expected_score * 10, v_won, v_expected_score, 'challenge'
  );
  IF v_reward.applied THEN
    PERFORM public.apply_game_engagement(
      p_user_id, v_won, v_expected_score, v_challenge.category
    );
    INSERT INTO public.scores (user_id, username, category, score, game_mode)
    VALUES (
      p_user_id, left(coalesce(v_username, ''), 80),
      v_challenge.category, v_expected_score, 'challenge'
    );
  END IF;
  RETURN QUERY SELECT v_reward.applied, v_reward.xp_gained, v_reward.coins_gained,
    v_reward.new_xp, v_reward.new_coins, v_reward.new_level, v_reward.newly_unlocked;
END;
$$;

CREATE TABLE IF NOT EXISTS public.survival_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  category text NOT NULL,
  question_ids jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  score int,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS survival_attempts_user_created_idx
  ON public.survival_attempts (user_id, created_at DESC);

DROP FUNCTION IF EXISTS public.start_survival_attempt(text,text,text);
CREATE OR REPLACE FUNCTION public.start_survival_attempt(
  p_user_id text,
  p_category text,
  p_guest_token text
)
RETURNS SETOF public.survival_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_attempt public.survival_attempts%ROWTYPE;
  v_question_ids jsonb;
  v_is_premium boolean := false;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT coalesce(u.is_premium, false) INTO v_is_premium
  FROM public.users AS u WHERE u.id::text = p_user_id;
  IF NOT v_is_premium AND (
    SELECT count(*) FROM public.survival_attempts AS attempt
    WHERE attempt.user_id = p_user_id AND attempt.created_at::date = current_date
  ) >= 5 THEN
    RAISE EXCEPTION 'Daily survival limit reached';
  END IF;
  SELECT jsonb_agg(chosen.id ORDER BY chosen.position)
  INTO v_question_ids
  FROM (
    SELECT q.id, row_number() OVER (ORDER BY extensions.gen_random_bytes(8)) AS position
    FROM public.questions AS q
    WHERE q.category <> 'legends'
      AND (p_category = 'mix' OR q.category = p_category)
    LIMIT 100
  ) AS chosen;
  IF jsonb_array_length(coalesce(v_question_ids, '[]'::jsonb)) < 4 THEN
    RAISE EXCEPTION 'Not enough survival questions';
  END IF;
  INSERT INTO public.survival_attempts (user_id, category, question_ids)
  VALUES (p_user_id, p_category, v_question_ids)
  RETURNING * INTO v_attempt;
  RETURN NEXT v_attempt;
END;
$$;

DROP FUNCTION IF EXISTS public.settle_survival_game(text,text,text,text,int,int,text);
DROP FUNCTION IF EXISTS public.settle_survival_game(uuid,text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.settle_survival_game(
  p_attempt_id uuid,
  p_user_id text,
  p_username text,
  p_answers jsonb,
  p_guest_token text
)
RETURNS TABLE(
  applied boolean, xp_gained int, coins_gained int,
  new_xp int, new_coins int, new_level int, newly_unlocked text[],
  settled_score int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_attempt public.survival_attempts%ROWTYPE;
  v_reward record;
  v_won boolean;
  v_answer jsonb;
  v_position bigint;
  v_correct boolean;
  v_score int := 0;
  v_lives int := 3;
  v_event_key text;
BEGIN
  PERFORM public.assert_game_user(p_user_id, p_guest_token);
  SELECT * INTO v_attempt FROM public.survival_attempts AS attempt
  WHERE attempt.id = p_attempt_id AND attempt.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR p_username IS NULL OR length(trim(p_username)) = 0
     OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Invalid survival settlement';
  END IF;
  v_event_key := 'survival:' || p_attempt_id::text;
  IF v_attempt.status = 'active' THEN
    FOR v_answer, v_position IN
      SELECT value, ordinality
      FROM jsonb_array_elements(p_answers) WITH ORDINALITY
    LOOP
      IF v_position > jsonb_array_length(v_attempt.question_ids)
         OR (v_attempt.question_ids->>(v_position - 1)::int)::int
            IS DISTINCT FROM (v_answer->>'questionId')::int THEN
        RAISE EXCEPTION 'Invalid survival answer sequence';
      END IF;
      IF coalesce((v_answer->>'skipped')::boolean, false) THEN CONTINUE; END IF;
      SELECT (q.options->>q.correct) = (v_answer->>'answerText')
      INTO v_correct FROM public.questions AS q
      WHERE q.id = (v_answer->>'questionId')::int;
      IF coalesce(v_correct, false) THEN
        v_score := v_score + 1;
      ELSE
        v_lives := v_lives - 1;
        IF v_lives <= 0 THEN EXIT; END IF;
      END IF;
    END LOOP;
    IF v_lives > 0 AND jsonb_array_length(p_answers) < jsonb_array_length(v_attempt.question_ids) THEN
      RAISE EXCEPTION 'Survival attempt is not complete';
    END IF;
    UPDATE public.survival_attempts
    SET status = 'completed', score = v_score, completed_at = clock_timestamp()
    WHERE id = p_attempt_id RETURNING * INTO v_attempt;
  ELSE
    v_score := coalesce(v_attempt.score, 0);
  END IF;
  v_won := v_score >= 15;
  SELECT * INTO v_reward FROM public.apply_game_reward_v2(
    p_user_id, v_event_key,
    CASE WHEN v_score >= 10 THEN 30 ELSE greatest(5, v_score * 2) END,
    CASE WHEN v_won THEN 25 ELSE 0 END,
    v_score * 10, v_won, v_score, 'survival'
  );
  IF v_reward.applied THEN
    PERFORM public.apply_game_engagement(p_user_id, v_won, v_score, v_attempt.category);
    INSERT INTO public.scores (user_id, username, category, score, game_mode)
    VALUES (
      p_user_id, left(trim(p_username), 80), v_attempt.category, v_score, 'survival'
    );
  END IF;
  RETURN QUERY SELECT v_reward.applied, v_reward.xp_gained, v_reward.coins_gained,
    v_reward.new_xp, v_reward.new_coins, v_reward.new_level, v_reward.newly_unlocked,
    v_score;
END;
$$;

ALTER TABLE public.ranked_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_active_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_game_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survival_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_scores_insert ON public.daily_scores;
DROP POLICY IF EXISTS daily_scores_update ON public.daily_scores;
DROP POLICY IF EXISTS ranked_queue_read ON public.ranked_queue;
DROP POLICY IF EXISTS ranked_matches_read ON public.ranked_matches;
CREATE POLICY ranked_queue_read ON public.ranked_queue FOR SELECT USING (true);
CREATE POLICY ranked_matches_read ON public.ranked_matches FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.daily_scores FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scores FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.challenges FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ranked_queue FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ranked_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ranked_answers, public.ranked_active_players,
  public.daily_attempts, public.daily_answers,
  public.game_reward_events, public.guest_game_identities,
  public.survival_attempts FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.assert_game_user(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_game_reward(text,text,int,int,int,boolean,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_game_reward_v2(text,text,int,int,int,boolean,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enter_ranked_queue(text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_ranked_queue(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_or_advance_ranked_match(uuid,text,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_ranked_answer(uuid,text,int,int,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_daily_attempt(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_daily_answer(uuid,text,int,int,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_game_engagement(text,boolean,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_challenge_game(uuid,text,text,int,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_challenge_game(uuid,text,text,text,int,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_challenge_game_result(uuid,text,text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_challenge_game(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_survival_attempt(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_survival_game(uuid,text,text,jsonb,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enter_ranked_queue(text,text,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ranked_queue(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_or_advance_ranked_match(uuid,text,int,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ranked_answer(uuid,text,int,int,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_daily_attempt(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_daily_answer(uuid,text,int,int,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_challenge_game(uuid,text,text,int,int,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_challenge_game(uuid,text,text,text,int,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_challenge_game_result(uuid,text,text,text,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_challenge_game(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_survival_attempt(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_survival_game(uuid,text,text,jsonb,text) TO anon, authenticated;
