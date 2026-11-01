import { listRecentComments } from './comments'
import { all, first, VIDEO_COUNTS, type Video, type VideoCounts } from './db'
import { thumbnailUrl } from './videos'

// The Studio (GET /api/studio): the channel owner's view of how the channel is doing, and what's new
// since their last visit. Times are D1's 'YYYY-MM-DDTHH:MM:SSZ' strings, which sort as text.

export const STUDIO_COMMENTS = 50
export const SEEN_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"

export async function lastVisit(db: D1Database, userId: number) {
  return (await first<{ seen_at: string }>(db, 'SELECT seen_at FROM studio_visits WHERE user_id = ?', userId))?.seen_at ?? null
}

// Marks a visit up to `seenAt`: never later than now, never earlier than a visit already recorded.
export async function markSeen(db: D1Database, userId: number, seenAt: string) {
  const row = await first<{ seen_at: string }>(
    db,
    `INSERT INTO studio_visits (user_id, seen_at) VALUES (?, MIN(?, ${NOW}))
     ON CONFLICT (user_id) DO UPDATE SET seen_at = MAX(studio_visits.seen_at, excluded.seen_at)
     RETURNING seen_at`,
    userId,
    seenAt,
  )
  return row!.seen_at
}

interface StudioVideoRow extends Video, VideoCounts {
  comment_count: number
  new_views: number
  new_likes: number
  new_comments: number
}

// Every published video plus the owner's drafts, with the existing view and like counts
// (VIDEO_COUNTS), comments, and how many of each arrived after `since` from someone other than the
// viewer (your own views, likes and comments aren't news to you). A first visit (no since) counts
// everything else as new.
function listStudioVideos(db: D1Database, ownerId: number | null, since: string, viewerId: number) {
  return all<StudioVideoRow>(
    db,
    `SELECT videos.*, ${VIDEO_COUNTS},
       (SELECT COUNT(*) FROM comments WHERE comments.video_id = videos.id) AS comment_count,
       (SELECT COUNT(*) FROM views WHERE views.video_id = videos.id AND views.created_at > ?1 AND views.user_id != ?3) AS new_views,
       (SELECT COUNT(*) FROM likes WHERE likes.video_id = videos.id AND likes.created_at > ?1 AND likes.user_id != ?3) AS new_likes,
       (SELECT COUNT(*) FROM comments WHERE comments.video_id = videos.id AND comments.created_at > ?1 AND comments.user_id != ?3) AS new_comments
     FROM videos WHERE videos.status = 'published' OR (videos.status = 'draft' AND videos.uploaded_by = ?2)
     ORDER BY COALESCE(videos.published_at, videos.created_at) DESC, videos.id DESC`,
    since,
    ownerId,
    viewerId,
  )
}

// Everything GET /api/studio returns, for `userId` (whose last visit decides what's new) on a channel
// owned by `ownerId` (whose drafts are listed).
export async function studio(db: D1Database, userId: number, ownerId: number | null) {
  const since = await lastVisit(db, userId)
  // The moment this read counts as seen: the client sends it back to POST /api/studio/seen, so anything
  // that arrives after this read is still new next time.
  const asOf = (await first<{ now: string }>(db, `SELECT ${NOW} AS now`))!.now
  const after = since ?? ''
  const [rows, comments] = await Promise.all([listStudioVideos(db, ownerId, after, userId), listRecentComments(db, STUDIO_COMMENTS)])

  const sum = (pick: (r: StudioVideoRow) => number) => rows.reduce((n, r) => n + pick(r), 0)
  const published = rows.filter((r) => r.status === 'published')
  const newVideos = published.filter((r) => (r.published_at ?? '') > after).length

  return {
    since,
    as_of: asOf,
    totals: {
      videos: { total: published.length, new: newVideos },
      views: { total: sum((r) => r.view_count), new: sum((r) => r.new_views) },
      likes: { total: sum((r) => r.like_count), new: sum((r) => r.new_likes) },
      comments: { total: sum((r) => r.comment_count), new: sum((r) => r.new_comments) },
    },
    videos: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      published_at: r.published_at,
      created_at: r.created_at,
      thumbnail_url: r.thumbnail_key ? thumbnailUrl(r.id, r.thumbnail_key) : null,
      views: { total: r.view_count, new: r.new_views },
      likes: { total: r.like_count, new: r.new_likes },
      comments: { total: r.comment_count, new: r.new_comments },
    })),
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      user: { id: c.user_id, username: c.username },
      video: { id: c.video_id, title: c.video_title },
      is_reply: c.parent_id !== null,
      link: `/watch/${c.video_id}#comment-${c.id}`,
      new: c.created_at > after && c.user_id !== userId,
    })),
  }
}
