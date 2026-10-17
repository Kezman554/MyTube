import { addLike, countLikes, removeLike } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireApproved } from '../../../lib/guards'
import { canSee, loadVideo, videoError } from '../../../lib/videos'

// POST /api/videos/:id/like and DELETE /api/videos/:id/like -> { liked, like_count }. Both are
// idempotent. Likes open once a video is published, like comments.
function setLike(liked: boolean): ApiFunction {
  return async ({ env, data, params }) => {
    const user = data.user!
    const video = await loadVideo(env.DB, params.id)
    if (!video || !canSee(user, video)) return videoError(404, 'not_found')
    if (video.status !== 'published') {
      return videoError(409, 'not_published', 'Likes open once the video is published.')
    }
    await (liked ? addLike : removeLike)(env.DB, video.id, user.id)
    return Response.json({ liked, like_count: await countLikes(env.DB, video.id) })
  }
}

export const onRequestPost = [requireApproved, setLike(true)]
export const onRequestDelete = [requireApproved, setLike(false)]
