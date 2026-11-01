-- When each user last looked at the Studio, so it can show what's new since. Per user: the owner
-- and the admin each have their own. seen_at is set by POST /api/studio/seen to the moment the Studio
-- data was read (never later than now, never moving backwards).

CREATE TABLE studio_visits (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  seen_at TEXT    NOT NULL
);
