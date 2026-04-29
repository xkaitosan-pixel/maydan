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

-- 1. party_rooms: auto-advance + server-side question timing
ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0;
ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0;

-- 2. users: profile fields (display name, country, bio)
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT '';

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
-- The bucket has already been created programmatically (public: true,
-- allowed_mime_types: jpeg/png/webp/gif, file_size_limit: 5MB).
-- The SQL below adds RLS policies on storage.objects for completeness.
-- If the bucket was not auto-created, create it manually in:
--   Supabase Dashboard → Storage → New Bucket
--   name: avatars, Public bucket: ON

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_public_read'
  ) THEN
    CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_insert'
  ) THEN
    CREATE POLICY avatars_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_update'
  ) THEN
    CREATE POLICY avatars_update ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_delete'
  ) THEN
    CREATE POLICY avatars_delete ON storage.objects FOR DELETE USING (bucket_id = 'avatars');
  END IF;
END $$;
