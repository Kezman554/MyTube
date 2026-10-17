import { countViews, recordView } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireApproved } from '../../../lib/guards'
import { canSee, loadVideo, VIEW_WINDOW_MINUTES, videoError } from '../../../lib/videos'

// POST /api/videos/:id/view -> { counted, view_count }. The watch page calls it once, after a few
// seconds of playback. Only published videos count (reviewing a draft is not a view), and a repeat
// from the same user within VIEW_WINDOW_MINUTES is ignored.
const view: ApiFunction = async ({ env, data, params }) => {
  const user = data.user!
  const video = await loadVideo(env.DB, params.id)
  if (!video || !canSee(user, video)) return videoError(404, 'not_found')

  const counted = video.status === 'published' && (await recordView(env.DB, video.id, user.id, VIEW_WINDOW_MINUTES))
  return Response.json({ counted, view_count: await countViews(env.DB, video.id) })
}

export const onRequestPost = [requireApproved, view]
