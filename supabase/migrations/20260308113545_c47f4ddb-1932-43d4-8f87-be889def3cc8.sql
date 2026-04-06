-- Step 1: Create enum for match status
CREATE TYPE public.arena_match_status AS ENUM ('waiting', 'countdown', 'playing', 'finished');

-- Step 2: Create arena_matches table
CREATE TABLE public.arena_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  room_code text NOT NULL UNIQUE,
  status arena_match_status NOT NULL DEFAULT 'waiting',
  max_players integer NOT NULL DEFAULT 10,
  current_question_index integer NOT NULL DEFAULT 0,
  question_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Step 3: Create arena_participants table
CREATE TABLE public.arena_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.arena_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  total_time_ms integer NOT NULL DEFAULT 0,
  answers jsonb DEFAULT '[]'::jsonb,
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(match_id, user_id)
);

-- Step 4: Create indexes for performance
CREATE INDEX idx_arena_matches_room_code ON public.arena_matches(room_code);
CREATE INDEX idx_arena_matches_status ON public.arena_matches(status);
CREATE INDEX idx_arena_participants_match_id ON public.arena_participants(match_id);
CREATE INDEX idx_arena_participants_user_id ON public.arena_participants(user_id);

-- Step 5: Enable RLS
ALTER TABLE public.arena_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_participants ENABLE ROW LEVEL SECURITY;

-- Step 6: RLS Policies for arena_matches
-- Anyone authenticated can view matches (needed to join via room code)
CREATE POLICY "Authenticated users can view matches"
  ON public.arena_matches FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can create matches (they become host)
CREATE POLICY "Authenticated users can create matches"
  ON public.arena_matches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- Host can update their match
CREATE POLICY "Host can update their match"
  ON public.arena_matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id);

-- Host can delete their match if still waiting
CREATE POLICY "Host can delete waiting match"
  ON public.arena_matches FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id AND status = 'waiting');

-- Step 7: RLS Policies for arena_participants
-- Participants can view all participants in matches they're part of
CREATE POLICY "Participants can view match participants"
  ON public.arena_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.arena_participants ap
      WHERE ap.match_id = arena_participants.match_id
      AND ap.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.arena_matches am
      WHERE am.id = arena_participants.match_id
      AND am.host_id = auth.uid()
    )
  );

-- Authenticated users can join matches
CREATE POLICY "Authenticated users can join matches"
  ON public.arena_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Players can update their own participation (answers, score, ready status)
CREATE POLICY "Players can update own participation"
  ON public.arena_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Players can leave (delete) their participation
CREATE POLICY "Players can leave match"
  ON public.arena_participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 8: Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_participants;