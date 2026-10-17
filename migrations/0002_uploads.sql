-- In-progress multipart video uploads, so only the user who started one can add parts to,
-- complete or abort it. A row is deleted when its upload completes or is aborted.
-- R2 discards incomplete multipart uploads on its own after 7 days; a leftover row is harmless.

CREATE TABLE uploads (
  upload_id    TEXT    PRIMARY KEY,
  r2_key       TEXT    NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users (id),
  filename     TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  size         INTEGER NOT NULL CHECK (size > 0),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_uploads_user ON uploads (user_id);
