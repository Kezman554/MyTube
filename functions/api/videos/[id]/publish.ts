import { publishVideo } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requirePower } from '../../../lib/guards'
import { callerCanSee, loadVideo, videoError, videoJson } from '../../../lib/videos'

// POST /api/videos/:id/publish -> { video }: publish_own, publishing one of your own drafts without
// review. Anyone else's draft is 403 (that is review_drafts, at /api/admin/videos/:id/publish).
// Already published changes nothing, so a double click is harmless.
const publish: ApiFunction = async (context) => {
  const { env, data, params } = context
  const video = await loadVideo(env.DB, params.id)
  if (!video || !(await callerCanSee(context, video))) return videoError(404, 'not_found')
  if (video.uploaded_by !== data.user!.id) {
    return videoError(403, 'not_yours', 'You can only publish your own videos here.')
  }
  if (video.status === 'published') return Response.json({ video: videoJson(video) })
  const published = (await publishVideo(env.DB, video.id)) ?? (await loadVideo(env.DB, params.id))
  return Response.json({ video: videoJson(published!) })
}

export const onRequestPost = [requirePower('publish_own'), publish]
