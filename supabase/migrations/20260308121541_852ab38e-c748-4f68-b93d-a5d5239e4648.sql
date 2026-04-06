
-- Create security definer function to check arena participation without recursion
CREATE OR REPLACE FUNCTION public.is_arena_participant(_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE match_id = _match_id AND user_id = auth.uid()
  )
$$;

-- Create security definer function to check if user is host of a match
CREATE OR REPLACE FUNCTION public.is_arena_host(_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.arena_matches
    WHERE id = _match_id AND host_id = auth.uid()
  )
$$;

-- Drop the recursive SELECT policy
DROP POLICY IF EXISTS "Participants can view match participants" ON public.arena_participants;

-- Recreate using security definer functions
CREATE POLICY "Participants can view match participants"
ON public.arena_participants
FOR SELECT
TO authenticated
USING (
  public.is_arena_participant(match_id)
  OR public.is_arena_host(match_id)
);
