-- Replies, one level deep. parent_id is always a top-level comment on the same video (the API moves a
-- reply to a reply up to that reply's parent), so deleting a top-level comment deletes its thread.
-- reply_to_user_id is whose comment or reply was answered, for the "@username" in front of a reply
-- to a reply; it outlives that reply being deleted, and goes when that person does.

ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments (id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN reply_to_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX idx_comments_parent ON comments (parent_id);
