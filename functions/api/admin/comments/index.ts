import { listRecentComments, recentCommentJson } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'

// GET /api/admin/comments -> { comments: [{ id, body, created_at, video: { id, title },
//   user: { id, username, role, can_comment } }] }: the newest 100 comments on every video, newest first.
const recent: ApiFunction = async ({ env }) => {
  const comments = await listRecentComments(env.DB)
  return Response.json({ comments: comments.map(recentCommentJson) })
}

export const onRequestGet = [requireRole('admin'), recent]
