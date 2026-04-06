
-- Add player_phase column for phase-based session restoration
ALTER TABLE public.arena_participants
ADD COLUMN player_phase text NOT NULL DEFAULT 'answering'
CHECK (player_phase IN ('answering', 'revealed', 'finished'));
