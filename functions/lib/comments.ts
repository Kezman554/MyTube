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
  user_role: string
  user_can_comment: number
}

// Who is looking, for the moderation flags. Null for anyone without moderate_comments.
export interface Moderator {
  id: number
  isAdmin: boolean
}

// What a moderator can do to one comment, so the page shows only controls that will work:
//   delete  false under the power for the admin's comment, or a top-level comment with an admin reply
//           (deleting it would delete that reply); the admin can delete anything
//   mute    false for the admin's comments and your own
//   muted   whether the author is muted now (Mute or Unmute)
export function moderationFor(mod: Moderator, row: CommentRow, threadHasAdminReply: boolean) {
  const byAdmin = row.user_role === 'admin'
  return {
    delete: mod.isAdmin || (!byAdmin && !threadHasAdminReply),
    mute: !byAdmin && row.user_id !== mod.id,
    muted: row.user_can_comment === 0,
  }
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
    comments.parent_id, comments.reply_to_user_id, reply_to.username AS reply_to_username,
    users.role AS user_role, users.can_comment AS user_can_comment
  FROM comments JOIN users ON users.id = comments.user_id LEFT JOIN users AS reply_to ON reply_to.id = comments.reply_to_user_id`

// Every comment on a video, oldest first; id breaks ties between comments posted in the same second.
function listAll(db: D1Database, videoId: number) {
  return all<CommentRow>(db, `${SELECT} WHERE comments.video_id = ? ORDER BY comments.created_at, comments.id`, videoId)
}

// The video's comments as threads: top-level comments newest first, each with its replies oldest
// first, and count, the number of comments including replies. With a moderator, each comment and reply
// also carries moderation (see moderationFor).
export async function listThreads(db: D1Database, videoId: number, mod: Moderator | null = null) {
  const rows = await listAll(db, videoId)
  const adminReplied = new Set(rows.filter((r) => r.parent_id !== null && r.user_role === 'admin').map((r) => r.parent_id))
  const json = (row: CommentRow) => {
    const base = commentJson(row)
    if (!mod) return base
    return { ...base, moderation: moderationFor(mod, row, row.parent_id === null && adminReplied.has(row.id)) }
  }
  const replies = new Map<number, ReturnType<typeof json>[]>()
  for (const row of rows) {
    if (row.parent_id === null) continue
    const list = replies.get(row.parent_id) ?? []
    list.push(json(row))
    replies.set(row.parent_id, list)
  }
  const threads = rows
    .filter((row) => row.parent_id === null)
    .reverse()
    .map((row) => ({ ...json(row), replies: replies.get(row.id) ?? [] }))
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

// Adds a comment, or a reply under `reply`. Null when the parent has gone since findReplyTarget: the
// insert checks it still exists as part of the same statement. The foreign key alone isn't enough,
// because ids are reused: with the newest comment deleted, the reply would take its id and point at itself.
export async function addComment(db: D1Database, videoId: number, userId: number, body: string, reply: ReplyTarget | null = null) {
  const inserted = await first<{ id: number }>(
    db,
    `INSERT INTO comments (video_id, user_id, body, parent_id, reply_to_user_id)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE ?4 IS NULL OR EXISTS (SELECT 1 FROM comments WHERE id = ?4 AND video_id = ?1 AND parent_id IS NULL)
     RETURNING id`,
    videoId,
    userId,
    body,
    reply?.parent_id ?? null,
    reply?.reply_to_user_id ?? null,
  )
  if (!inserted) return null
  return (await first<CommentRow>(db, `${SELECT} WHERE comments.id = ?`, inserted.id))!
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

// Deletes comment `id`; deleting a top-level comment deletes its replies too (ON DELETE CASCADE on
// parent_id). With spareAdmin (anyone but the admin), nothing is deleted if the comment, or any reply
// that would go with it, is the admin's. The check is part of the DELETE itself, so an admin reply
// arriving while the request runs is either seen by it or posted after the thread is gone, never
// swept away with it.
//   'deleted'  it's gone
//   'admin'    refused: the admin's comment, or a thread with an admin reply
//   'gone'     there was no such comment
export async function deleteComment(db: D1Database, id: number, spareAdmin: boolean): Promise<'deleted' | 'admin' | 'gone'> {
  const sql = spareAdmin
    ? `DELETE FROM comments WHERE id = ?1 AND NOT EXISTS (
         SELECT 1 FROM comments AS c JOIN users ON users.id = c.user_id
         WHERE (c.id = ?1 OR c.parent_id = ?1) AND users.role = 'admin'
       ) RETURNING id`
    : 'DELETE FROM comments WHERE id = ?1 RETURNING id'
  if ((await first(db, sql, id)) !== null) return 'deleted'
  if (!spareAdmin) return 'gone'
  // Not deleted: either it wasn't there, or the admin's part in it kept it.
  return (await first(db, 'SELECT 1 AS found FROM comments WHERE id = ?', id)) !== null ? 'admin' : 'gone'
}

// The admin's moderation list: the newest comments on every video, with the video they are on,
// whether the author can still comment (for the Mute action), and for a reply, the top-level comment
// it belongs to; for a top-level comment, how many replies a Delete takes with it.
export interface RecentCommentRow extends CommentRow {
  video_title: string
  parent_username: string | null
  reply_count: number
  admin_replied: number
}

export const RECENT_COMMENTS_LIMIT = 100

export function listRecentComments(db: D1Database, limit = RECENT_COMMENTS_LIMIT) {
  return all<RecentCommentRow>(
    db,
    `SELECT comments.id, comments.video_id, comments.user_id, users.username, comments.body, comments.created_at,
       comments.parent_id, comments.reply_to_user_id, reply_to.username AS reply_to_username,
       videos.title AS video_title, users.role AS user_role, users.can_comment AS user_can_comment,
       parent_user.username AS parent_username,
       (SELECT COUNT(*) FROM comments AS r WHERE r.parent_id = comments.id) AS reply_count,
       EXISTS (SELECT 1 FROM comments AS r JOIN users AS ru ON ru.id = r.user_id
               WHERE r.parent_id = comments.id AND ru.role = 'admin') AS admin_replied
     FROM comments JOIN users ON users.id = comments.user_id JOIN videos ON videos.id = comments.video_id
       LEFT JOIN users AS reply_to ON reply_to.id = comments.reply_to_user_id
       LEFT JOIN comments AS parent ON parent.id = comments.parent_id
       LEFT JOIN users AS parent_user ON parent_user.id = parent.user_id
     ORDER BY comments.created_at DESC, comments.id DESC LIMIT ?`,
    limit,
  )
}

export function recentCommentJson(row: RecentCommentRow, mod: Moderator) {
  return {
    ...commentJson(row),
    moderation: moderationFor(mod, row, row.admin_replied === 1),
    video: { id: row.video_id, title: row.video_title },
    user: { id: row.user_id, username: row.username, role: row.user_role, can_comment: row.user_can_comment === 1 },
    parent: row.parent_id === null ? null : { id: row.parent_id, username: row.parent_username! },
    reply_count: row.reply_count,
  }
}
