import { addComment, commentJson, findReplyTarget, listThreads, readCommentBody, readParentId } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { powersOf, requireApproved } from '../../../lib/guards'
import { isAdmin } from '../../../lib/powers'
import { readJsonObject } from '../../../lib/uploads'
import { callerCanSee, loadVideo, videoError } from '../../../lib/videos'

// GET /api/videos/:id/comments -> { comments: [{ id, body, created_at, user: { id, username },
//   replies: [{ id, body, created_at, user, parent_id, reply_to: { id, username } | null }] }], count },
// for anyone who can see the video. Top-level comments newest first, replies oldest first; count
// includes replies. For a caller with moderate_comments, each comment and reply also carries
// moderation: { delete, mute, muted }, saying which controls will work on it.
const list: ApiFunction = async (context) => {
  const { env, data, params } = context
  const video = await loadVideo(env.DB, params.id)
  if (!video || !(await callerCanSee(context, video))) return videoError(404, 'not_found')
  const caller = data.user!
  const mod = (await powersOf(context)).has('moderate_comments') ? { id: caller.id, isAdmin: isAdmin(caller) } : null
  return Response.json(await listThreads(env.DB, video.id, mod))
}

// POST /api/videos/:id/comments { body, parent_id? } -> 201 { comment }. Muted users (can_comment = 0)
// get 403 'muted'. Comments open once a video is published; the body is trimmed and length-limited.
// parent_id makes it a reply: it must be a comment on this video (else 400 'invalid_parent'), and a
// reply to a reply is stored against that reply's parent, so threads are one level deep.
const post: ApiFunction = async (context) => {
  const { request, env, data, params } = context
  const user = data.user!
  const video = await loadVideo(env.DB, params.id)
  if (!video || !(await callerCanSee(context, video))) return videoError(404, 'not_found')
  if (!user.can_comment) return videoError(403, 'muted', "You can't post comments at the moment.")
  if (video.status !== 'published') {
    return videoError(409, 'not_published', 'Comments open once the video is published.')
  }

  const input = await readJsonObject(request)
  const parsed = readCommentBody(input?.body)
  if ('message' in parsed) return videoError(400, 'invalid_comment', parsed.message)

  const parent = readParentId(input?.parent_id)
  if ('message' in parent) return videoError(400, 'invalid_parent', parent.message)
  const reply = parent.id === null ? null : await findReplyTarget(env.DB, video.id, parent.id)
  if (parent.id !== null && !reply) {
    return videoError(400, 'invalid_parent', 'That comment has been deleted, so it can no longer be replied to.')
  }

  const comment = await addComment(env.DB, video.id, user.id, parsed.body, reply)
  return Response.json({ comment: commentJson(comment) }, { status: 201 })
}

export const onRequestGet = [requireApproved, list]
export const onRequestPost = [requireApproved, post]
