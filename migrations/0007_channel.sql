-- The channel belongs to a user account. One row only (id = 1). The admin picks the owner (an approved
-- user; setting another moves it); the owner and the admin edit the bio and banner. The channel's
-- name and avatar stay fixed in the frontend. banner_key is an R2 key under banners/, or null for the
-- built-in particle banner.

CREATE TABLE channel (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  owner_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  bio           TEXT    NOT NULL DEFAULT '',
  banner_key    TEXT,
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO channel (id) VALUES (1);
