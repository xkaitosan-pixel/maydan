-- Run these in your Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. party_rooms: auto-advance + server-side question start time
ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0;
ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0;

-- 2. users: profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT '';

-- 3. daily_scores table
CREATE TABLE IF NOT EXISTS daily_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  country text DEFAULT '',
  score int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 5,
  date text NOT NULL,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);
