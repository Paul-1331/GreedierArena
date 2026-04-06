
-- Add slug column to quizzes
ALTER TABLE public.quizzes ADD COLUMN slug text UNIQUE;

-- Generate slugs for existing quizzes from title
UPDATE public.quizzes SET slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')) || '-' || left(id::text, 8);

-- Make slug NOT NULL after populating
ALTER TABLE public.quizzes ALTER COLUMN slug SET NOT NULL;

-- Index for fast slug lookups
CREATE INDEX idx_quizzes_slug ON public.quizzes(slug);
