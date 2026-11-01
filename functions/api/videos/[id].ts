import { getVideoWithCounts, hasLiked, updateVideo, type VideoChanges } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { powersOf, requireAdmin, requireApproved, requirePower } from '../../lib/guards'
import { deleteObject, putObject } from '../../lib/storage'
import {
  callerCanSee,
  canEdit,
  deleteVideoEverywhere,
  loadVideo,
  readText,
  readThumbnail,
  readVideoForm,
  videoError,
  videoJson,
} from '../../lib/videos'

// Every method carries its own guard (the /api gate is the backstop); canSee decides which approved
// users may see each video.

// GET /api/videos/:id -> { video } with view_count, like_count and liked (by the caller). Drafts are visible to
// their uploader, the admin and reviewers (see canSee).
const get: ApiFunction = async (context) => {
  const { env, data, params } = context
  const id = Number(params.id)
  const video = Number.isSafeInteger(id) && id > 0 ? await getVideoWithCounts(env.DB, id) : null
  if (!video || !(await callerCanSee(context, video))) return videoError(404, 'not_found')
  return Response.json({ video: { ...videoJson(video), liked: await hasLiked(env.DB, video.id, data.user!.id) } })
}

export const onRequestGet = [requireApproved, get]

// PATCH /api/videos/:id, multipart/form-data with any of title, description, thumbnail (a file).
// The admin may edit any video; anyone with upload only their own drafts. -> { video }
const patch: ApiFunction = async (context) => {
  const { request, env, data, params } = context
  const user = data.user!
  const video = await loadVideo(env.DB, params.id)
  // Someone who can't see a video gets 404 rather than learning it exists.
  if (!video || !(await callerCanSee(context, video))) return videoError(404, 'not_found')
  if (!canEdit(user, await powersOf(context), video)) {
    return videoError(403, 'forbidden', 'Only the admin can edit a published video, or anyone else’s.')
  }

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

export const onRequestPatch = [requirePower('upload'), patch]

// DELETE /api/videos/:id (admin only: no power covers it): removes any video, published or not, with its files. -> { ok: true }
const remove: ApiFunction = async ({ env, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video) return videoError(404, 'not_found')
  await deleteVideoEverywhere(env.DB, env.MEDIA, video)
  return Response.json({ ok: true })
}

export const onRequestDelete = [requireAdmin, remove]
