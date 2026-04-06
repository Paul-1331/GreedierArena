-- 1) Extend arena_matches with war-specific controls.
ALTER TABLE public.arena_matches
  ADD COLUMN IF NOT EXISTS min_rating integer,
  ADD COLUMN IF NOT EXISTS max_rating integer,
  ADD COLUMN IF NOT EXISTS allow_unrated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS join_cutoff_ratio double precision NOT NULL DEFAULT 0.75;

ALTER TABLE public.arena_matches
  DROP CONSTRAINT IF EXISTS arena_matches_join_cutoff_ratio_check;

ALTER TABLE public.arena_matches
  ADD CONSTRAINT arena_matches_join_cutoff_ratio_check
  CHECK (join_cutoff_ratio > 0 AND join_cutoff_ratio < 1);

ALTER TABLE public.arena_matches
  DROP CONSTRAINT IF EXISTS arena_matches_rating_bounds_check;

ALTER TABLE public.arena_matches
  ADD CONSTRAINT arena_matches_rating_bounds_check
  CHECK (min_rating IS NULL OR max_rating IS NULL OR min_rating <= max_rating);

-- 2) Require scheduled start for official wars.
CREATE OR REPLACE FUNCTION public.validate_official_match_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_official AND NEW.scheduled_start_at IS NULL THEN
    RAISE EXCEPTION 'Official wars require a scheduled start time';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_official_match_schedule_trigger ON public.arena_matches;
CREATE TRIGGER validate_official_match_schedule_trigger
BEFORE INSERT OR UPDATE ON public.arena_matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_official_match_schedule();

-- 3) Validate joins for wars.
CREATE OR REPLACE FUNCTION public.validate_arena_participant_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.arena_matches%ROWTYPE;
  v_count integer;
  v_rating double precision;
  v_matches_played integer;
  v_question_count integer;
  v_time_limit integer;
  v_total_seconds double precision;
  v_elapsed_seconds double precision;
  v_start_time timestamptz;
BEGIN
  SELECT * INTO v_match
  FROM public.arena_matches
  WHERE id = NEW.match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.arena_participants
  WHERE match_id = NEW.match_id;

  IF v_count >= v_match.max_players THEN
    RAISE EXCEPTION 'Match is full';
  END IF;

  IF v_match.is_official THEN
    IF v_match.status = 'finished' THEN
      RAISE EXCEPTION 'War already finished';
    END IF;

    SELECT rating, matches_played
      INTO v_rating, v_matches_played
    FROM public.arena_ratings
    WHERE user_id = NEW.user_id;

    IF COALESCE(v_matches_played, 0) = 0 THEN
      IF NOT v_match.allow_unrated THEN
        RAISE EXCEPTION 'Unrated players are not eligible for this war';
      END IF;
    ELSE
      IF v_match.min_rating IS NOT NULL AND v_rating < v_match.min_rating THEN
        RAISE EXCEPTION 'Your rating is below the minimum for this war';
      END IF;
      IF v_match.max_rating IS NOT NULL AND v_rating > v_match.max_rating THEN
        RAISE EXCEPTION 'Your rating is above the maximum for this war';
      END IF;
    END IF;

    v_start_time := COALESCE(v_match.started_at, v_match.scheduled_start_at);

    IF v_start_time IS NOT NULL AND now() >= v_start_time THEN
      SELECT GREATEST(count(*), 1)
        INTO v_question_count
      FROM public.quiz_questions
      WHERE quiz_id = v_match.quiz_id;

      SELECT GREATEST(COALESCE(time_limit_seconds, 30), 1)
        INTO v_time_limit
      FROM public.quizzes
      WHERE id = v_match.quiz_id;

      v_total_seconds := v_question_count * v_time_limit;
      v_elapsed_seconds := EXTRACT(epoch FROM (now() - v_start_time));

      IF v_elapsed_seconds >= v_total_seconds THEN
        RAISE EXCEPTION 'War already ended';
      END IF;

      IF v_elapsed_seconds > (v_total_seconds * COALESCE(v_match.join_cutoff_ratio, 0.75)) THEN
        RAISE EXCEPTION 'Join window closed for this war';
      END IF;
    END IF;
  ELSE
    IF v_match.status <> 'waiting' THEN
      RAISE EXCEPTION 'Match has already started';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_arena_participant_join_trigger ON public.arena_participants;
CREATE TRIGGER validate_arena_participant_join_trigger
BEFORE INSERT ON public.arena_participants
FOR EACH ROW
EXECUTE FUNCTION public.validate_arena_participant_join();

-- 4) process_due_wars
CREATE OR REPLACE FUNCTION public.process_due_wars()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started integer := 0;
  v_finished integer := 0;
BEGIN
  UPDATE public.arena_matches am
  SET
    status = 'playing',
    started_at = COALESCE(am.started_at, am.scheduled_start_at, now()),
    question_started_at = COALESCE(am.question_started_at, am.scheduled_start_at, now())
  WHERE am.is_official = true
    AND am.status = 'waiting'
    AND am.scheduled_start_at IS NOT NULL
    AND am.scheduled_start_at <= now();

  GET DIAGNOSTICS v_started = ROW_COUNT;

  WITH war_duration AS (
    SELECT
      am.id,
      COALESCE(am.started_at, am.scheduled_start_at) AS start_at,
      (GREATEST(COALESCE(q.time_limit_seconds, 30), 1) * GREATEST(count(qq.id), 1))::double precision AS total_seconds
    FROM public.arena_matches am
    JOIN public.quizzes q ON q.id = am.quiz_id
    LEFT JOIN public.quiz_questions qq ON qq.quiz_id = am.quiz_id
    WHERE am.is_official = true
      AND am.status IN ('countdown', 'playing')
    GROUP BY am.id, q.time_limit_seconds
  )
  UPDATE public.arena_matches am
  SET
    status = 'finished',
    finished_at = COALESCE(am.finished_at, now())
  FROM war_duration wd
  WHERE am.id = wd.id
    AND wd.start_at IS NOT NULL
    AND now() >= wd.start_at + make_interval(secs => wd.total_seconds::integer);

  GET DIAGNOSTICS v_finished = ROW_COUNT;

  RETURN jsonb_build_object(
    'started', v_started,
    'finished', v_finished
  );
END;
$$;

-- 5) Updated RLS for arena_participants
DROP POLICY IF EXISTS "Participants can view match participants" ON public.arena_participants;
CREATE POLICY "Participants can view match participants"
ON public.arena_participants
FOR SELECT
TO authenticated
USING (
  public.is_arena_participant(match_id)
  OR public.is_arena_host(match_id)
  OR EXISTS (
    SELECT 1
    FROM public.arena_matches am
    WHERE am.id = arena_participants.match_id
      AND am.is_official = true
  )
);

-- 6) Updated RLS for quiz_questions
DROP POLICY IF EXISTS "Questions viewable with quiz access" ON public.quiz_questions;
CREATE POLICY "Questions viewable with quiz access" ON public.quiz_questions FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = quiz_id
      AND (
        q.status = 'approved'
        OR q.creator_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.arena_matches am
    JOIN public.arena_participants ap ON ap.match_id = am.id
    WHERE am.quiz_id = quiz_questions.quiz_id
      AND am.is_official = true
      AND ap.user_id = auth.uid()
      AND am.status IN ('countdown', 'playing', 'finished')
  )
);

-- 7) Index
CREATE INDEX IF NOT EXISTS idx_arena_matches_official_scheduled
  ON public.arena_matches (is_official, scheduled_start_at);