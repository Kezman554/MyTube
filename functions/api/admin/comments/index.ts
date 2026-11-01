import { listRecentComments, recentCommentJson } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { requirePower } from '../../../lib/guards'

// GET /api/admin/comments (moderate_comments) -> { comments: [{ id, body, created_at, video: { id, title }, parent: { id, username } | null,
//   reply_count, user: { id, username, role, can_comment } }] }: the newest 100 comments on every video,
//   newest first. parent is the top-level comment a reply belongs to; replies also carry parent_id and reply_to.
const recent: ApiFunction = async ({ env }) => {
  const comments = await listRecentComments(env.DB)
  return Response.json({ comments: comments.map(recentCommentJson) })
}

export const onRequestGet = [requirePower('moderate_comments'), recent]
