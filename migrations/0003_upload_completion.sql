-- Keep upload rows after completion, so POST /api/videos can check that a video key came from
-- a finished upload by the same user. A row with completed_at set is a whole object in R2.
-- Uploads completed before this migration have no row (they were deleted on completion); the
-- admin finds those through GET /api/admin/orphans, which lists R2 directly.

ALTER TABLE uploads ADD COLUMN completed_at TEXT;
