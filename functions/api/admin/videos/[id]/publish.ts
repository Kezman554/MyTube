import { publishVideo } from '../../../../lib/db'
import type { ApiFunction } from '../../../../lib/env'
import { actsOnAdmin, cannotActOnAdmin, requirePower } from '../../../../lib/guards'
import { isAdminId, loadVideo, videoError, videoJson } from '../../../../lib/videos'

// POST /api/admin/videos/:id/publish -> { video } (review_drafts): anyone's draft goes live for every
// approved user, except the admin's own drafts, which only the admin publishes (403).
// Publishing a video that is already published changes nothing, so a double click is harmless.
const publish: ApiFunction = async ({ env, data, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video) return videoError(404, 'not_found')
  if (actsOnAdmin(data.user!, await isAdminId(env.DB, video.uploaded_by))) {
    return cannotActOnAdmin("That's the admin's draft; only the admin can publish it.")
  }
  if (video.status === 'published') return Response.json({ video: videoJson(video) })
  const published = (await publishVideo(env.DB, video.id)) ?? (await loadVideo(env.DB, params.id))
  return Response.json({ video: videoJson(published!) })
}

export const onRequestPost = [requirePower('review_drafts'), publish]
