import { all, deleteUpload, getUploadByKey, getVideoByKey, type Upload } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireRole } from '../../lib/guards'
import { deleteObject, VIDEO_PREFIX } from '../../lib/storage'
import { videoError } from '../../lib/videos'

// Leftover uploads: whole video files in R2 that no video record points at. These are uploads
// finished before uploads were kept on record, and completed uploads whose details were never saved.
// The admin either creates the video (POST /api/videos with the key) or deletes the file here.

// GET /api/admin/orphans -> { orphans: [{ key, size, uploaded_at, uploaded_by, filename }] }, oldest first.
// uploaded_by and filename are null for files from before uploads were kept on record.
const list: ApiFunction = async ({ env }) => {
  const used = new Set((await all<{ r2_key: string }>(env.DB, 'SELECT r2_key FROM videos')).map((v) => v.r2_key))
  const uploads = new Map(
    (await all<Upload & { username: string }>(
      env.DB,
      'SELECT uploads.*, users.username FROM uploads JOIN users ON users.id = uploads.user_id WHERE completed_at IS NOT NULL',
    )).map((u) => [u.r2_key, u]),
  )

  const orphans = []
  let cursor: string | undefined
  do {
    const page = await env.MEDIA.list({ prefix: VIDEO_PREFIX, cursor })
    for (const object of page.objects) {
      if (used.has(object.key)) continue
      const upload = uploads.get(object.key)
      orphans.push({
        key: object.key,
        size: object.size,
        uploaded_at: object.uploaded.toISOString(),
        uploaded_by: upload ? { id: upload.user_id, username: upload.username } : null,
        filename: upload?.filename ?? null,
      })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  orphans.sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
  return Response.json({ orphans })
}

// DELETE /api/admin/orphans?key=videos/… deletes a leftover file. Refuses a key a video uses,
// or one with an upload still in progress.
const remove: ApiFunction = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get('key')
  if (!key || !key.startsWith(VIDEO_PREFIX) || key.includes('..')) return videoError(400, 'invalid_key')
  if (await getVideoByKey(env.DB, key)) return videoError(409, 'has_video', 'A video uses this file.')

  const upload = await getUploadByKey(env.DB, key)
  if (upload && !upload.completed_at) return videoError(409, 'upload_in_progress', 'This upload is still in progress.')
  if (!(await env.MEDIA.head(key))) return videoError(404, 'not_found')

  await deleteObject(env.MEDIA, key)
  if (upload) await deleteUpload(env.DB, upload.upload_id)
  return Response.json({ ok: true })
}

export const onRequestGet = [requireRole('admin'), list]
export const onRequestDelete = [requireRole('admin'), remove]
