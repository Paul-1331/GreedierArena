
-- Indexes for frequently queried columns to improve scalability

-- Quizzes: status filter is used on almost every page
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON public.quizzes (status);
CREATE INDEX IF NOT EXISTS idx_quizzes_creator_id ON public.quizzes (creator_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status_created ON public.quizzes (status, created_at DESC);

-- Quiz questions: always queried by quiz_id
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON public.quiz_questions (quiz_id, order_index);

-- Quiz attempts: queried by user_id and quiz_id
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON public.quiz_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON public.quiz_attempts (quiz_id);

-- Arena matches: status filter + room_code lookups
CREATE INDEX IF NOT EXISTS idx_arena_matches_status ON public.arena_matches (status);
CREATE INDEX IF NOT EXISTS idx_arena_matches_room_code ON public.arena_matches (room_code);
CREATE INDEX IF NOT EXISTS idx_arena_matches_host_id ON public.arena_matches (host_id);

-- Arena participants: match_id and user_id lookups
CREATE INDEX IF NOT EXISTS idx_arena_participants_match_id ON public.arena_participants (match_id);
CREATE INDEX IF NOT EXISTS idx_arena_participants_user_id ON public.arena_participants (user_id);

-- Arena ratings: user_id lookup + leaderboard sorting
CREATE INDEX IF NOT EXISTS idx_arena_ratings_user_id ON public.arena_ratings (user_id);
CREATE INDEX IF NOT EXISTS idx_arena_ratings_rating ON public.arena_ratings (rating DESC);

-- Profiles: user_id lookup
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);

-- User roles: fast role checks
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles (user_id, role);
