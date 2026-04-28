-- =====================================================================
-- Maydan — Database Migrations
-- Run in: Supabase Dashboard → SQL Editor
-- All statements are idempotent (safe to run multiple times)
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
  total int NOT NULL DEFAULT 5,
  date text NOT NULL DEFAULT '',
  completed_at timestamptz DEFAULT now()
);

-- 4. daily_scores: add any columns that may be missing if table already existed
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS country text DEFAULT '';
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0;
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS total int NOT NULL DEFAULT 5;
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS date text NOT NULL DEFAULT '';
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now();

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
