import { updateVideo, type VideoChanges } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireRole } from '../../lib/guards'
import { deleteObject, putObject } from '../../lib/storage'
import {
  canEdit,
  canSee,
  deleteVideoEverywhere,
  loadVideo,
  readText,
  readThumbnail,
  readVideoForm,
  videoError,
  videoJson,
} from '../../lib/videos'

// Approval is enforced by the /api gate; canSee decides which approved users may see each video.

// GET /api/videos/:id -> { video }. Drafts are visible to the admin and their uploader only.
export const onRequestGet: ApiFunction = async ({ env, data, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video || !canSee(data.user!, video)) return videoError(404, 'not_found')
  return Response.json({ video: videoJson(video) })
}

// PATCH /api/videos/:id, multipart/form-data with any of title, description, thumbnail (a file).
// The admin may edit any video; a creator only their own drafts. -> { video }
const patch: ApiFunction = async ({ request, env, data, params }) => {
  const user = data.user!
  const video = await loadVideo(env.DB, params.id)
  // Someone who can't see a video gets 404 rather than learning it exists.
  if (!video || !canSee(user, video)) return videoError(404, 'not_found')
  if (!canEdit(user, video)) return videoError(403, 'forbidden', 'Only the admin can edit a published video.')

  const form = await readVideoForm(request)
  if (form instanceof Response) return form

  const changes: VideoChanges = {}
  for (const name of ['title', 'description'] as const) {
    const field = readText(form, name, false)
    if (field && 'error' in field) return field.error
    if (field) changes[name] = field.value
  }
  const thumbnail = await readThumbnail(form.get('thumbnail'))
  if (thumbnail instanceof Response) return thumbnail
  if (thumbnail) changes.thumbnail_key = thumbnail.key
  if (Object.keys(changes).length === 0) {
    return videoError(400, 'no_changes', 'Send at least one of title, description or thumbnail.')
  }

  if (thumbnail) await putObject(env.MEDIA, thumbnail.key, thumbnail.bytes, thumbnail.contentType)
  const updated = await updateVideo(env.DB, video.id, changes)
  // The old thumbnail is unreachable now; remove it so it doesn't use up storage.
  if (thumbnail && video.thumbnail_key) await deleteObject(env.MEDIA, video.thumbnail_key)
  return Response.json({ video: videoJson(updated!) })
}

export const onRequestPatch = [requireRole('creator'), patch]

// DELETE /api/videos/:id (admin): removes any video, published or not, with its files. -> { ok: true }
const remove: ApiFunction = async ({ env, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video) return videoError(404, 'not_found')
  await deleteVideoEverywhere(env.DB, env.MEDIA, video)
  return Response.json({ ok: true })
}

export const onRequestDelete = [requireRole('admin'), remove]
