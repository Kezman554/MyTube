-- The admin access switch: while admin_access = 0, the four admin powers (manage_playlists,
-- moderate_comments, review_drafts, approve_users) don't apply anywhere, though their rows in
-- user_powers stay, so switching it back on restores exactly what was ticked. upload and publish_own
-- are unaffected. Only the admin changes it (PUT /api/admin/users/:id/admin-access); the admin's own
-- account is refused and holds every power regardless.

ALTER TABLE users ADD COLUMN admin_access INTEGER NOT NULL DEFAULT 1 CHECK (admin_access IN (0, 1));
