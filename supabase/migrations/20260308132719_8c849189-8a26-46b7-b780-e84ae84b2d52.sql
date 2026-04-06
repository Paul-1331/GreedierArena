
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_changes_remaining integer NOT NULL DEFAULT 2;
