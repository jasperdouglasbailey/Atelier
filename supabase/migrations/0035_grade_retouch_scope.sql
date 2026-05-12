-- Migration 0035: add grade_retouch_scope to atelier_bookings
-- Values: 'grade_and_retouch' | 'grade_only' | NULL (not specified)

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS grade_retouch_scope text
    CHECK (grade_retouch_scope IS NULL OR grade_retouch_scope IN ('grade_and_retouch', 'grade_only'));
