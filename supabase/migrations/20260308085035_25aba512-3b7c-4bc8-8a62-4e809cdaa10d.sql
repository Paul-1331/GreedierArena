
-- Add question_type column with default for backward compatibility
ALTER TABLE public.quiz_questions 
ADD COLUMN question_type text NOT NULL DEFAULT 'single_mcq';

-- Change correct_answer from integer to jsonb
-- First, convert existing integer values to jsonb
ALTER TABLE public.quiz_questions 
ALTER COLUMN correct_answer TYPE jsonb USING to_jsonb(correct_answer);
