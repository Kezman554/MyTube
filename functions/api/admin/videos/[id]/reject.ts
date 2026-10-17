import type { ApiFunction } from '../../../../lib/env'
import { requireRole } from '../../../../lib/guards'
import { deleteVideoEverywhere, loadVideo, videoError } from '../../../../lib/videos'

// POST /api/admin/videos/:id/reject -> { ok: true }: turns a draft away, deleting its record and its
// video and thumbnail files. Drafts only: a published video is removed with DELETE /api/videos/:id,
// so a stray reject can never take down something people are watching.
const reject: ApiFunction = async ({ env, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video) return videoError(404, 'not_found')
  if (video.status !== 'draft') {
    return videoError(409, 'not_a_draft', 'Only drafts can be rejected. Delete a published video instead.')
  }
  await deleteVideoEverywhere(env.DB, env.MEDIA, video)
  return Response.json({ ok: true })
}

export const onRequestPost = [requireRole('admin'), reject]
