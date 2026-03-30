-- ميدان Database Schema
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/hnoqkcrzualzxkzmuwvp/sql

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id TEXT UNIQUE,
  username TEXT,
  avatar_url TEXT,
  total_wins INT DEFAULT 0,
  total_losses INT DEFAULT 0,
  streak_count INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_played DATE,
  is_premium BOOLEAN DEFAULT false,
  total_points INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  category TEXT NOT NULL,
  score INT NOT NULL,
  total INT DEFAULT 0,
  game_mode TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_name TEXT NOT NULL,
  opponent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opponent_name TEXT,
  status TEXT DEFAULT 'pending',
  creator_score INT,
  opponent_score INT,
  category TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  creator_answers TEXT,
  opponent_answers TEXT,
  question_count INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT now()
);

-- Disable RLS for simplicity (anon key can read/write)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE challenges DISABLE ROW LEVEL SECURITY;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS scores_username_idx ON scores(username);
CREATE INDEX IF NOT EXISTS scores_game_mode_idx ON scores(game_mode);
CREATE INDEX IF NOT EXISTS scores_created_at_idx ON scores(created_at DESC);
CREATE INDEX IF NOT EXISTS challenges_id_idx ON challenges(id);
CREATE INDEX IF NOT EXISTS users_auth_id_idx ON users(auth_id);
