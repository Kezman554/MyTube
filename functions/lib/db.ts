// Typed D1 access. Row types mirror migrations/; keep them in step.

export type Role = 'admin' | 'creator' | 'viewer'
export type UserStatus = 'pending' | 'approved' | 'removed'
export type VideoStatus = 'draft' | 'published'

export interface User {
  id: number
  email: string
  username: string
  role: Role
  status: UserStatus
  can_comment: 0 | 1
  created_at: string
}

export interface Video {
  id: number
  title: string
  description: string
  r2_key: string
  thumbnail_key: string | null
  status: VideoStatus
  uploaded_by: number
  created_at: string
  published_at: string | null
}

export interface Playlist {
  id: number
  title: string
  description: string
  created_at: string
}

export interface PlaylistVideo {
  playlist_id: number
  video_id: number
  position: number
}

export interface Like {
  user_id: number
  video_id: number
  created_at: string
}

export interface Comment {
  id: number
  video_id: number
  user_id: number
  body: string
  created_at: string
}

export interface View {
  id: number
  video_id: number
  user_id: number
  created_at: string
}

type Param = string | number | null

// Generic helpers: always bind parameters, never interpolate into SQL.

export async function first<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>()
}

export async function all<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>()
  return results
}

export async function run(db: D1Database, sql: string, ...params: Param[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run()
}

// Users

export function getUserByEmail(db: D1Database, email: string) {
  return first<User>(db, 'SELECT * FROM users WHERE email = ?', email)
}

export function getUserById(db: D1Database, id: number) {
  return first<User>(db, 'SELECT * FROM users WHERE id = ?', id)
}

export function createUser(
  db: D1Database,
  email: string,
  username: string,
  role: Role = 'viewer',
  status: UserStatus = 'pending',
) {
  return first<User>(
    db,
    'INSERT INTO users (email, username, role, status) VALUES (?, ?, ?, ?) RETURNING *',
    email,
    username,
    role,
    status,
  )
}

export function listUsers(db: D1Database, status?: UserStatus) {
  return status
    ? all<User>(db, 'SELECT * FROM users WHERE status = ? ORDER BY created_at, id', status)
    : all<User>(db, 'SELECT * FROM users ORDER BY created_at, id')
}

export type UserChanges = Partial<Pick<User, 'status' | 'role' | 'can_comment'>>

// Column names come from this fixed list, never from the caller.
const USER_COLUMNS = ['status', 'role', 'can_comment'] as const

export function updateUser(db: D1Database, id: number, changes: UserChanges) {
  const columns = USER_COLUMNS.filter((column) => changes[column] !== undefined)
  if (columns.length === 0) return getUserById(db, id)
  return first<User>(
    db,
    `UPDATE users SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? RETURNING *`,
    ...columns.map((column) => changes[column]!),
    id,
  )
}

// Uploads (in-progress multipart uploads, see migrations/0002_uploads.sql)

export interface Upload {
  upload_id: string
  r2_key: string
  user_id: number
  filename: string
  content_type: string
  size: number
  created_at: string
  // Set once the parts are joined into one object of the declared size.
  completed_at: string | null
}

export function createUpload(db: D1Database, upload: Omit<Upload, 'created_at' | 'completed_at'>) {
  return run(
    db,
    'INSERT INTO uploads (upload_id, r2_key, user_id, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?)',
    upload.upload_id,
    upload.r2_key,
    upload.user_id,
    upload.filename,
    upload.content_type,
    upload.size,
  )
}

export function getUpload(db: D1Database, uploadId: string) {
  return first<Upload>(db, 'SELECT * FROM uploads WHERE upload_id = ?', uploadId)
}

export function getUploadByKey(db: D1Database, key: string) {
  return first<Upload>(db, 'SELECT * FROM uploads WHERE r2_key = ?', key)
}

export function markUploadComplete(db: D1Database, uploadId: string) {
  return run(db, "UPDATE uploads SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE upload_id = ?", uploadId)
}

export function deleteUpload(db: D1Database, uploadId: string) {
  return run(db, 'DELETE FROM uploads WHERE upload_id = ?', uploadId)
}

// Videos

export function getVideo(db: D1Database, id: number) {
  return first<Video>(db, 'SELECT * FROM videos WHERE id = ?', id)
}

export function getVideoByKey(db: D1Database, key: string) {
  return first<Video>(db, 'SELECT * FROM videos WHERE r2_key = ?', key)
}

export interface VideoCounts {
  view_count: number
  like_count: number
}

// Select-list fragment adding each video's view and like counts (both tables are indexed on video_id).
export const VIDEO_COUNTS = `(SELECT COUNT(*) FROM views WHERE views.video_id = videos.id) AS view_count,
  (SELECT COUNT(*) FROM likes WHERE likes.video_id = videos.id) AS like_count`

// What a user sees on the channel: every published video, plus their own drafts (newest first,
// drafts by when they were saved), each with its view and like counts. Matches canSee() in
// lib/videos.ts, which checks single videos; only the admin's review queue (listDrafts) goes further.
export function listVisibleVideos(db: D1Database, userId: number) {
  return all<Video & VideoCounts>(
    db,
    `SELECT videos.*, ${VIDEO_COUNTS} FROM videos WHERE status = 'published' OR uploaded_by = ?
     ORDER BY COALESCE(published_at, created_at) DESC, id DESC`,
    userId,
  )
}

export function getVideoWithCounts(db: D1Database, id: number) {
  return first<Video & VideoCounts>(db, `SELECT videos.*, ${VIDEO_COUNTS} FROM videos WHERE id = ?`, id)
}

export async function hasLiked(db: D1Database, videoId: number, userId: number) {
  return (await first(db, 'SELECT 1 AS liked FROM likes WHERE video_id = ? AND user_id = ?', videoId, userId)) !== null
}

export async function countLikes(db: D1Database, videoId: number) {
  return (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM likes WHERE video_id = ?', videoId))!.n
}

// Idempotent: liking twice, or unliking something not liked, changes nothing.
export function addLike(db: D1Database, videoId: number, userId: number) {
  return run(db, 'INSERT OR IGNORE INTO likes (user_id, video_id) VALUES (?, ?)', userId, videoId)
}

export function removeLike(db: D1Database, videoId: number, userId: number) {
  return run(db, 'DELETE FROM likes WHERE user_id = ? AND video_id = ?', userId, videoId)
}

// Records a view unless this user already has one for this video in the last `windowMinutes`.
// Check and insert are one statement, so two requests arriving together can't both count.
// Returns whether this view counted.
export async function recordView(db: D1Database, videoId: number, userId: number, windowMinutes: number) {
  const result = await run(
    db,
    `INSERT INTO views (video_id, user_id)
     SELECT ?1, ?2 WHERE NOT EXISTS (
       SELECT 1 FROM views WHERE video_id = ?1 AND user_id = ?2
         AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?3)
     )`,
    videoId,
    userId,
    `-${windowMinutes} minutes`,
  )
  return result.meta.changes > 0
}

export async function countViews(db: D1Database, videoId: number) {
  return (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM views WHERE video_id = ?', videoId))!.n
}

export function listDrafts(db: D1Database) {
  return all<Video>(db, "SELECT * FROM videos WHERE status = 'draft' ORDER BY created_at, id")
}

export function publishVideo(db: D1Database, id: number) {
  return first<Video>(
    db,
    `UPDATE videos SET status = 'published', published_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ? AND status = 'draft' RETURNING *`,
    id,
  )
}

// Likes, comments, views and playlist entries go with it (ON DELETE CASCADE).
export function deleteVideoRow(db: D1Database, id: number) {
  return run(db, 'DELETE FROM videos WHERE id = ?', id)
}

export function createVideo(
  db: D1Database,
  video: Pick<Video, 'title' | 'description' | 'r2_key' | 'thumbnail_key' | 'status' | 'uploaded_by'>,
) {
  return first<Video>(
    db,
    `INSERT INTO videos (title, description, r2_key, thumbnail_key, status, uploaded_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') END)
     RETURNING *`,
    video.title,
    video.description,
    video.r2_key,
    video.thumbnail_key,
    video.status,
    video.uploaded_by,
    video.status,
  )
}

export type VideoChanges = Partial<Pick<Video, 'title' | 'description' | 'thumbnail_key'>>

// Column names come from this fixed list, never from the caller.
const VIDEO_COLUMNS = ['title', 'description', 'thumbnail_key'] as const

export function updateVideo(db: D1Database, id: number, changes: VideoChanges) {
  const columns = VIDEO_COLUMNS.filter((column) => changes[column] !== undefined)
  if (columns.length === 0) return getVideo(db, id)
  return first<Video>(
    db,
    `UPDATE videos SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? RETURNING *`,
    ...columns.map((column) => changes[column]!),
    id,
  )
}
