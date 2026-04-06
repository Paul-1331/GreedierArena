UPDATE arena_matches
SET status = 'finished', finished_at = now()
WHERE id IN ('7dd37b0d-cbd1-4b47-8389-362c8963f2ec', 'f79d5563-09f9-41ad-a8e5-a6b62947cec8')
  AND status IN ('waiting', 'countdown', 'playing');