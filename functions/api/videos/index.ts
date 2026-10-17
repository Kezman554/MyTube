import { createVideo, listVisibleVideos, type VideoStatus } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireApproved, requireRole } from '../../lib/guards'
import { deleteObject, putObject } from '../../lib/storage'
import { readText, readThumbnail, readVideoForm, resolveVideoKey, videoError, videoJson } from '../../lib/videos'

// GET /api/videos -> { videos }: every published video, plus the caller's own drafts, newest first,
// each with view_count and like_count. Approval is enforced by the /api gate and requireApproved.
const list: ApiFunction = async ({ env, data }) => {
  const videos = await listVisibleVideos(env.DB, data.user!.id)
  return Response.json({ videos: videos.map(videoJson) })
}

export const onRequestGet = [requireApproved, list]

// POST /api/videos, multipart/form-data:
//   key          the R2 key from a completed /api/uploads upload (see resolveVideoKey)
//   title        required, up to 100 characters
//   description  optional, up to 5000 characters
//   thumbnail    optional JPG, PNG or WebP file, up to 5 MB
//   publish      'true' to publish straight away: admin only; a creator's video is always a draft
// -> 201 with the video
const create: ApiFunction = async ({ request, env, data }) => {
  const user = data.user!
  const form = await readVideoForm(request)
  if (form instanceof Response) return form

  const title = readText(form, 'title', true)
  if (title && 'error' in title) return title.error
  const description = readText(form, 'description', false)
  if (description && 'error' in description) return description.error
  const thumbnail = await readThumbnail(form.get('thumbnail'))
  if (thumbnail instanceof Response) return thumbnail

  const source = await resolveVideoKey(env.DB, env.MEDIA, user, form.get('key'))
  if (source instanceof Response) return source

  const status: VideoStatus = user.role === 'admin' && form.get('publish') === 'true' ? 'published' : 'draft'

  if (thumbnail) await putObject(env.MEDIA, thumbnail.key, thumbnail.bytes, thumbnail.contentType)
  try {
    const video = await createVideo(env.DB, {
      title: title!.value,
      description: description?.value ?? '',
      r2_key: source.key,
      thumbnail_key: thumbnail?.key ?? null,
      status,
      uploaded_by: source.uploadedBy,
    })
    return Response.json({ video: videoJson(video!) }, { status: 201 })
  } catch (err) {
    if (thumbnail) await deleteObject(env.MEDIA, thumbnail.key)
    // Lost a race with another request for the same upload: videos.r2_key is unique.
    if (String(err).includes('UNIQUE')) return videoError(409, 'already_has_video', 'That upload already has a video.')
    throw err
  }
}

export const onRequestPost = [requireRole('creator'), create]
