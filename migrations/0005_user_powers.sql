-- Named powers replace the creator role, so the admin can hand out control a piece at a time.
-- The admin (users.role = 'admin', the ADMIN_EMAIL account) has every power implicitly and has no
-- rows here; a power never makes anyone an admin. Only the admin grants or revokes them.
--   upload             upload videos, which arrive as drafts
--   publish_own        publish your own drafts without review
--   manage_playlists   everything under /api/admin/playlists
--   moderate_comments  delete comments, mute or unmute commenters
--   review_drafts      publish or reject anyone's draft, see the drafts queue
--   approve_users      approve or remove pending and approved users

CREATE TABLE user_powers (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  power      TEXT    NOT NULL CHECK (power IN ('upload', 'publish_own', 'manage_playlists', 'moderate_comments', 'review_drafts', 'approve_users')),
  granted_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_id, power)
);

-- What creator meant is the upload power; afterwards role only separates the admin from everyone else.
INSERT INTO user_powers (user_id, power) SELECT id, 'upload' FROM users WHERE role = 'creator';
UPDATE users SET role = 'viewer' WHERE role = 'creator';

-- users.role's CHECK still allows 'creator'. Rebuilding users to tighten it would mean dropping the
-- table, and D1 keeps foreign keys on, so the drop would cascade into comments, likes, views and
-- uploads. These triggers refuse 'creator' (or anything but admin/viewer) from now on instead.
CREATE TRIGGER users_role_insert BEFORE INSERT ON users
WHEN NEW.role NOT IN ('admin', 'viewer')
BEGIN
  SELECT RAISE(ABORT, 'role must be admin or viewer');
END;

CREATE TRIGGER users_role_update BEFORE UPDATE OF role ON users
WHEN NEW.role NOT IN ('admin', 'viewer')
BEGIN
  SELECT RAISE(ABORT, 'role must be admin or viewer');
END;
