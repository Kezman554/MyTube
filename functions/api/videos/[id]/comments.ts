import { addComment, commentJson, listComments, readCommentBody } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { requireApproved } from '../../../lib/guards'
import { readJsonObject } from '../../../lib/uploads'
import { canSee, loadVideo, videoError } from '../../../lib/videos'

// GET /api/videos/:id/comments -> { comments: [{ id, body, created_at, user: { id, username } }] },
// newest first, for anyone who can see the video.
const list: ApiFunction = async ({ env, data, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video || !canSee(data.user!, video)) return videoError(404, 'not_found')
  const comments = await listComments(env.DB, video.id)
  return Response.json({ comments: comments.map(commentJson) })
}

// POST /api/videos/:id/comments { body } -> 201 { comment }. Muted users (can_comment = 0) get 403
// 'muted'. Comments open once a video is published; the body is trimmed and length-limited.
const post: ApiFunction = async ({ request, env, data, params }) => {
  const user = data.user!
  const video = await loadVideo(env.DB, params.id)
  if (!video || !canSee(user, video)) return videoError(404, 'not_found')
  if (!user.can_comment) return videoError(403, 'muted', "You can't post comments at the moment.")
  if (video.status !== 'published') {
    return videoError(409, 'not_published', 'Comments open once the video is published.')
  }

  const parsed = readCommentBody((await readJsonObject(request))?.body)
  if ('message' in parsed) return videoError(400, 'invalid_comment', parsed.message)

  const comment = await addComment(env.DB, video.id, user.id, parsed.body)
  return Response.json({ comment: commentJson(comment) }, { status: 201 })
}

export const onRequestGet = [requireApproved, list]
export const onRequestPost = [requireApproved, post]
