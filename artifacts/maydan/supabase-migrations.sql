-- =====================================================================
-- Maydan — Pending Migrations
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to run multiple times (all use ADD COLUMN IF NOT EXISTS)
-- =====================================================================

-- 1. party_rooms: auto-advance setting
ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0;

-- 2. users: profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT '';

-- 3. daily_scores: additional columns (table exists but is missing these)
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS total int NOT NULL DEFAULT 5;
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS date text NOT NULL DEFAULT '';

-- 4. Unique constraint on daily_scores (one attempt per user per day)
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
