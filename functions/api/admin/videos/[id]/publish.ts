import { publishVideo } from '../../../../lib/db'
import type { ApiFunction } from '../../../../lib/env'
import { requireRole } from '../../../../lib/guards'
import { loadVideo, videoError, videoJson } from '../../../../lib/videos'

// POST /api/admin/videos/:id/publish -> { video }: a draft goes live for every approved user.
// Publishing a video that is already published changes nothing, so a double click is harmless.
const publish: ApiFunction = async ({ env, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video) return videoError(404, 'not_found')
  if (video.status === 'published') return Response.json({ video: videoJson(video) })
  const published = (await publishVideo(env.DB, video.id)) ?? (await loadVideo(env.DB, params.id))
  return Response.json({ video: videoJson(published!) })
}

export const onRequestPost = [requireRole('admin'), publish]
