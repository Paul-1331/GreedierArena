
-- Add contest fields to arena_matches
ALTER TABLE public.arena_matches
  ADD COLUMN is_official boolean NOT NULL DEFAULT false,
  ADD COLUMN scheduled_start_at timestamptz;

-- Create arena_ratings table for Glicko-2 ratings (official matches only)
CREATE TABLE public.arena_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  rating double precision NOT NULL DEFAULT 1500,
  deviation double precision NOT NULL DEFAULT 350,
  volatility double precision NOT NULL DEFAULT 0.06,
  matches_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  total_score integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on arena_ratings
ALTER TABLE public.arena_ratings ENABLE ROW LEVEL SECURITY;

-- Everyone can view ratings (it's a public leaderboard)
CREATE POLICY "Ratings are viewable by everyone"
  ON public.arena_ratings FOR SELECT
  USING (true);

-- Only the system (via service role) should update ratings, but users need their own row
-- Users can insert their own rating row (initial)
CREATE POLICY "Users can insert own rating"
  ON public.arena_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own rating (for client-side Glicko-2 calc after official match)
CREATE POLICY "Users can update own rating"
  ON public.arena_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime for arena_ratings
ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_ratings;
