import { all, first } from './db'
import { listOrphans } from './orphans'
import { BANNER_PREFIX, listAllObjects, THUMBNAIL_PREFIX, VIDEO_PREFIX } from './storage'
import { thumbnailUrl } from './videos'

// The admin's dashboard (GET /api/admin/dashboard). Windows are rolling and exact to the second:
// the last 7 days are (now - 7 days, now], the previous 7 the week before that, (now - 14, now - 7].

const DAY_MS = 24 * 60 * 60 * 1000

// Cloudflare R2's free tier: 10 GB-month of storage. Taken as 10 x 10^9 bytes, the smaller reading,
// so the bar never looks roomier than the allowance.
export const R2_FREE_BYTES = 10 * 1000 ** 3

// D1's timestamp format, so windows compare as text against created_at columns.
export function iso(date: Date) {
  return date.toISOString().slice(0, 19) + 'Z'
}

export function windows(now: Date) {
  return {
    now: iso(now),
    week: iso(new Date(now.getTime() - 7 * DAY_MS)),
    fortnight: iso(new Date(now.getTime() - 14 * DAY_MS)),
    month: iso(new Date(now.getTime() - 30 * DAY_MS)),
  }
}

// This week and last week for one table's created_at.
async function weekOnWeek(db: D1Database, table: 'views' | 'likes' | 'comments' | 'users', w: ReturnType<typeof windows>) {
  const row = await first<{ current: number; previous: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM ${table} WHERE created_at > ?1 AND created_at <= ?2) AS current,
       (SELECT COUNT(*) FROM ${table} WHERE created_at > ?3 AND created_at <= ?1) AS previous`,
    w.week,
    w.now,
    w.fortnight,
  )
  return { current: row!.current, previous: row!.previous }
}

export async function dashboard(db: D1Database, bucket: R2Bucket, now = new Date()) {
  const w = windows(now)

  // Storage first: the videos/ listing also finds the leftover uploads.
  const [videoObjects, thumbnailObjects, bannerObjects] = await Promise.all(
    [VIDEO_PREFIX, THUMBNAIL_PREFIX, BANNER_PREFIX].map((prefix) => listAllObjects(bucket, prefix)),
  )
  const bytes = (objects: { size: number }[]) => objects.reduce((n, o) => n + o.size, 0)

  const [orphans, attention, views, likes, comments, users, watchers, top, rows] = await Promise.all([
    listOrphans(db, bucket, videoObjects),
    first<{ pending: number; drafts: number }>(
      db,
      `SELECT (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending,
              (SELECT COUNT(*) FROM videos WHERE status = 'draft') AS drafts`,
    ),
    weekOnWeek(db, 'views', w),
    weekOnWeek(db, 'likes', w),
    weekOnWeek(db, 'comments', w),
    weekOnWeek(db, 'users', w),
    // Every approved user: views this week and their last view ever, most active first, then most
    // recently seen, then those who have never watched.
    all<{ id: number; username: string; role: string; views_7d: number; last_view_at: string | null }>(
      db,
      `SELECT users.id, users.username, users.role,
         (SELECT COUNT(*) FROM views WHERE views.user_id = users.id AND views.created_at > ?1 AND views.created_at <= ?2) AS views_7d,
         (SELECT MAX(created_at) FROM views WHERE views.user_id = users.id AND views.created_at <= ?2) AS last_view_at
       FROM users WHERE users.status = 'approved'
       ORDER BY views_7d DESC, last_view_at IS NULL, last_view_at DESC, users.username`,
      w.week,
      w.now,
    ),
    all<{ id: number; title: string; thumbnail_key: string | null; views_30d: number }>(
      db,
      `SELECT videos.id, videos.title, videos.thumbnail_key, COUNT(*) AS views_30d
       FROM views JOIN videos ON videos.id = views.video_id
       WHERE views.created_at > ?1 AND views.created_at <= ?2
       GROUP BY videos.id ORDER BY views_30d DESC, videos.published_at DESC, videos.id DESC LIMIT 5`,
      w.month,
      w.now,
    ),
    first<{ users: number; videos: number; comments: number }>(
      db,
      'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM videos) AS videos, (SELECT COUNT(*) FROM comments) AS comments',
    ),
  ])

  return {
    generated_at: w.now,
    attention: {
      pending_users: attention!.pending,
      drafts: attention!.drafts,
      leftover_uploads: { count: orphans.length, bytes: bytes(orphans) },
    },
    week: { views, likes, comments, users },
    watchers: watchers.map((u) => ({ id: u.id, username: u.username, is_admin: u.role === 'admin', views_7d: u.views_7d, last_view_at: u.last_view_at })),
    top_videos: top.map((v) => ({
      id: v.id,
      title: v.title,
      thumbnail_url: v.thumbnail_key ? thumbnailUrl(v.id, v.thumbnail_key) : null,
      views_30d: v.views_30d,
    })),
    storage: {
      bytes: bytes(videoObjects) + bytes(thumbnailObjects) + bytes(bannerObjects),
      objects: videoObjects.length + thumbnailObjects.length + bannerObjects.length,
      by_prefix: { videos: bytes(videoObjects), thumbnails: bytes(thumbnailObjects), banners: bytes(bannerObjects) },
      free_tier_bytes: R2_FREE_BYTES,
      rows: rows!,
    },
  }
}
