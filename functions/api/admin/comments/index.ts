import { listRecentComments, recentCommentJson } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { requirePower } from '../../../lib/guards'
import { isAdmin } from '../../../lib/powers'

// GET /api/admin/comments (moderate_comments) -> { comments: [{ id, body, created_at, video: { id, title }, parent: { id, username } | null,
//   reply_count, user: { id, username, role, can_comment } }] }: the newest 100 comments on every video,
//   newest first. parent is the top-level comment a reply belongs to; replies also carry parent_id and reply_to.
// Under the power, the admin's own comments are left out: a moderator can neither delete nor mute
// them, so they would only be rows with nothing to do. Each comment carries moderation (moderationFor).
const recent: ApiFunction = async ({ env, data }) => {
  const caller = data.user!
  const mod = { id: caller.id, isAdmin: isAdmin(caller) }
  const comments = (await listRecentComments(env.DB)).filter((c) => mod.isAdmin || c.user_role !== 'admin')
  return Response.json({ comments: comments.map((c) => recentCommentJson(c, mod)) })
}

export const onRequestGet = [requirePower('moderate_comments'), recent]
