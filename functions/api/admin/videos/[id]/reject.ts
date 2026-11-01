import type { ApiFunction } from '../../../../lib/env'
import { actsOnAdmin, cannotActOnAdmin, requirePower } from '../../../../lib/guards'
import { deleteVideoEverywhere, isAdminId, loadVideo, videoError } from '../../../../lib/videos'

// POST /api/admin/videos/:id/reject -> { ok: true } (review_drafts): turns a draft away, deleting its record and its
// video and thumbnail files. Drafts only: a published video is removed with DELETE /api/videos/:id,
// so a stray reject can never take down something people are watching. The admin's own drafts are 403
// for anyone but the admin.
const reject: ApiFunction = async ({ env, data, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video) return videoError(404, 'not_found')
  if (actsOnAdmin(data.user!, await isAdminId(env.DB, video.uploaded_by))) {
    return cannotActOnAdmin("That's the admin's draft; only the admin can reject it.")
  }
  if (video.status !== 'draft') {
    return videoError(409, 'not_a_draft', 'Only drafts can be rejected. Delete a published video instead.')
  }
  await deleteVideoEverywhere(env.DB, env.MEDIA, video)
  return Response.json({ ok: true })
}

export const onRequestPost = [requirePower('review_drafts'), reject]
