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
