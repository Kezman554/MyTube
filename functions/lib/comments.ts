import { all, first } from './db'

export const COMMENT_MAX = 1000

export interface CommentRow {
  id: number
  video_id: number
  user_id: number
  username: string
  body: string
  created_at: string
}

// What the API says about a comment: who wrote it (username only, never their email) and when.
export function commentJson(row: CommentRow) {
  return { id: row.id, body: row.body, created_at: row.created_at, user: { id: row.user_id, username: row.username } }
}

const SELECT = `SELECT comments.id, comments.video_id, comments.user_id, users.username, comments.body, comments.created_at
  FROM comments JOIN users ON users.id = comments.user_id`

// Newest first. id breaks ties between comments posted in the same second.
export function listComments(db: D1Database, videoId: number) {
  return all<CommentRow>(db, `${SELECT} WHERE comments.video_id = ? ORDER BY comments.created_at DESC, comments.id DESC`, videoId)
}

export async function addComment(db: D1Database, videoId: number, userId: number, body: string) {
  const inserted = await first<{ id: number }>(
    db,
    'INSERT INTO comments (video_id, user_id, body) VALUES (?, ?, ?) RETURNING id',
    videoId,
    userId,
    body,
  )
  return (await first<CommentRow>(db, `${SELECT} WHERE comments.id = ?`, inserted!.id))!
}

// Trims the ends and normalises line breaks; refuses empty or over-long comments.
// Length is counted in characters (code points), so an emoji counts as one.
export function readCommentBody(value: unknown): { body: string } | { message: string } {
  if (typeof value !== 'string') return { message: 'Write a comment first.' }
  const body = value.replace(/\r\n?/g, '\n').trim()
  if (!body) return { message: 'Write a comment first.' }
  if (Array.from(body).length > COMMENT_MAX) return { message: `Comments can be up to ${COMMENT_MAX} characters.` }
  return { body }
}

export async function deleteComment(db: D1Database, id: number) {
  return (await first(db, 'DELETE FROM comments WHERE id = ? RETURNING id', id)) !== null
}

// The admin's moderation list: the newest comments on every video, with the video they are on and
// whether the author can still comment (for the Mute action).
export interface RecentCommentRow extends CommentRow {
  video_title: string
  user_role: string
  user_can_comment: number
}

export const RECENT_COMMENTS_LIMIT = 100

export function listRecentComments(db: D1Database, limit = RECENT_COMMENTS_LIMIT) {
  return all<RecentCommentRow>(
    db,
    `SELECT comments.id, comments.video_id, comments.user_id, users.username, comments.body, comments.created_at,
       videos.title AS video_title, users.role AS user_role, users.can_comment AS user_can_comment
     FROM comments JOIN users ON users.id = comments.user_id JOIN videos ON videos.id = comments.video_id
     ORDER BY comments.created_at DESC, comments.id DESC LIMIT ?`,
    limit,
  )
}

export function recentCommentJson(row: RecentCommentRow) {
  return {
    ...commentJson(row),
    video: { id: row.video_id, title: row.video_title },
    user: { id: row.user_id, username: row.username, role: row.user_role, can_comment: row.user_can_comment === 1 },
  }
}
