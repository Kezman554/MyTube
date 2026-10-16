-- MyTube initial schema.
-- Timestamps are ISO 8601 UTC text, e.g. 2026-10-16T18:00:00Z.
-- Users are never deleted: removal is status = 'removed'.

CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  username    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  role        TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'creator', 'viewer')),
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'removed')),
  can_comment INTEGER NOT NULL DEFAULT 1 CHECK (can_comment IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_users_status ON users (status, created_at);

CREATE TABLE videos (
  id            INTEGER PRIMARY KEY,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  r2_key        TEXT    NOT NULL UNIQUE,
  thumbnail_key TEXT,
  status        TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  uploaded_by   INTEGER NOT NULL REFERENCES users (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  published_at  TEXT,
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE INDEX idx_videos_status_published ON videos (status, published_at DESC);
CREATE INDEX idx_videos_uploaded_by ON videos (uploaded_by);

CREATE TABLE playlists (
  id          INTEGER PRIMARY KEY,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE playlist_videos (
  playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  video_id    INTEGER NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, video_id)
);

CREATE INDEX idx_playlist_videos_order ON playlist_videos (playlist_id, position);
CREATE INDEX idx_playlist_videos_video ON playlist_videos (video_id);

CREATE TABLE likes (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  video_id   INTEGER NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX idx_likes_video ON likes (video_id);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       TEXT    NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_comments_video ON comments (video_id, created_at);
CREATE INDEX idx_comments_user ON comments (user_id);

CREATE TABLE views (
  id         INTEGER PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_views_video ON views (video_id);
CREATE INDEX idx_views_user ON views (user_id);
