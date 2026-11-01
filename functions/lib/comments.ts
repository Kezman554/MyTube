import { all, first } from './db'

export const COMMENT_MAX = 1000

export interface CommentRow {
  id: number
  video_id: number
  user_id: number
  username: string
  body: string
  created_at: string
  parent_id: number | null
  reply_to_user_id: number | null
  reply_to_username: string | null
}

// What the API says about a comment: who wrote it (username only, never their email) and when.
// A reply also carries its top-level comment's id, and reply_to: whose reply it answered, when it
// answered a reply rather than the top-level comment (null otherwise, or once that person is gone).
export function commentJson(row: CommentRow) {
  const base = { id: row.id, body: row.body, created_at: row.created_at, user: { id: row.user_id, username: row.username } }
  if (row.parent_id === null) return base
  const replyTo = row.reply_to_user_id === null ? null : { id: row.reply_to_user_id, username: row.reply_to_username! }
  return { ...base, parent_id: row.parent_id, reply_to: replyTo }
}

const SELECT = `SELECT comments.id, comments.video_id, comments.user_id, users.username, comments.body, comments.created_at,
    comments.parent_id, comments.reply_to_user_id, reply_to.username AS reply_to_username
  FROM comments JOIN users ON users.id = comments.user_id LEFT JOIN users AS reply_to ON reply_to.id = comments.reply_to_user_id`

// Every comment on a video, oldest first; id breaks ties between comments posted in the same second.
function listAll(db: D1Database, videoId: number) {
  return all<CommentRow>(db, `${SELECT} WHERE comments.video_id = ? ORDER BY comments.created_at, comments.id`, videoId)
}

// The video's comments as threads: top-level comments newest first, each with its replies oldest
// first, and count, the number of comments including replies.
export async function listThreads(db: D1Database, videoId: number) {
  const rows = await listAll(db, videoId)
  const replies = new Map<number, ReturnType<typeof commentJson>[]>()
  for (const row of rows) {
    if (row.parent_id === null) continue
    const list = replies.get(row.parent_id) ?? []
    list.push(commentJson(row))
    replies.set(row.parent_id, list)
  }
  const threads = rows
    .filter((row) => row.parent_id === null)
    .reverse()
    .map((row) => ({ ...commentJson(row), replies: replies.get(row.id) ?? [] }))
  return { comments: threads, count: rows.length }
}

export interface ReplyTarget {
  parent_id: number
  reply_to_user_id: number | null
}

// Where a reply to comment `id` goes. Replies stay one level deep: a reply to a top-level comment
// hangs off it; a reply to a reply hangs off that reply's parent and names whose reply it answered.
// Null when there is no such comment on this video.
export async function findReplyTarget(db: D1Database, videoId: number, id: number): Promise<ReplyTarget | null> {
  const target = await first<{ video_id: number; user_id: number; parent_id: number | null }>(
    db,
    'SELECT video_id, user_id, parent_id FROM comments WHERE id = ?',
    id,
  )
  if (!target || target.video_id !== videoId) return null
  if (target.parent_id === null) return { parent_id: id, reply_to_user_id: null }
  return { parent_id: target.parent_id, reply_to_user_id: target.user_id }
}

export async function addComment(db: D1Database, videoId: number, userId: number, body: string, reply: ReplyTarget | null = null) {
  const inserted = await first<{ id: number }>(
    db,
    'INSERT INTO comments (video_id, user_id, body, parent_id, reply_to_user_id) VALUES (?, ?, ?, ?, ?) RETURNING id',
    videoId,
    userId,
    body,
    reply?.parent_id ?? null,
    reply?.reply_to_user_id ?? null,
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

// parent_id in a POST: absent or null for a top-level comment, else a positive whole number.
export function readParentId(value: unknown): { id: number | null } | { message: string } {
  if (value === undefined || value === null) return { id: null }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return { id: value }
  return { message: "That comment can't be replied to." }
}

// Deleting a top-level comment deletes its replies too (ON DELETE CASCADE on parent_id).
export async function deleteComment(db: D1Database, id: number) {
  return (await first(db, 'DELETE FROM comments WHERE id = ? RETURNING id', id)) !== null
}

// The admin's moderation list: the newest comments on every video, with the video they are on,
// whether the author can still comment (for the Mute action), and for a reply, the top-level comment
// it belongs to; for a top-level comment, how many replies a Delete takes with it.
export interface RecentCommentRow extends CommentRow {
  video_title: string
  user_role: string
  user_can_comment: number
  parent_username: string | null
  reply_count: number
}

export const RECENT_COMMENTS_LIMIT = 100

export function listRecentComments(db: D1Database, limit = RECENT_COMMENTS_LIMIT) {
  return all<RecentCommentRow>(
    db,
    `SELECT comments.id, comments.video_id, comments.user_id, users.username, comments.body, comments.created_at,
       comments.parent_id, comments.reply_to_user_id, reply_to.username AS reply_to_username,
       videos.title AS video_title, users.role AS user_role, users.can_comment AS user_can_comment,
       parent_user.username AS parent_username,
       (SELECT COUNT(*) FROM comments AS r WHERE r.parent_id = comments.id) AS reply_count
     FROM comments JOIN users ON users.id = comments.user_id JOIN videos ON videos.id = comments.video_id
       LEFT JOIN users AS reply_to ON reply_to.id = comments.reply_to_user_id
       LEFT JOIN comments AS parent ON parent.id = comments.parent_id
       LEFT JOIN users AS parent_user ON parent_user.id = parent.user_id
     ORDER BY comments.created_at DESC, comments.id DESC LIMIT ?`,
    limit,
  )
}

export function recentCommentJson(row: RecentCommentRow) {
  return {
    ...commentJson(row),
    video: { id: row.video_id, title: row.video_title },
    user: { id: row.user_id, username: row.username, role: row.user_role, can_comment: row.user_can_comment === 1 },
    parent: row.parent_id === null ? null : { id: row.parent_id, username: row.parent_username! },
    reply_count: row.reply_count,
  }
}
