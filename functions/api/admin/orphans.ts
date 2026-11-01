import { deleteUpload, getUploadByKey, getVideoByKey } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireAdmin } from '../../lib/guards'
import { listOrphans } from '../../lib/orphans'
import { deleteObject, VIDEO_PREFIX } from '../../lib/storage'
import { videoError } from '../../lib/videos'

// Admin only (no power covers it). Leftover uploads: see lib/orphans.ts.

// GET /api/admin/orphans -> { orphans: [{ key, size, uploaded_at, uploaded_by, filename }] }, oldest first.
// uploaded_by and filename are null for files from before uploads were kept on record.
const list: ApiFunction = async ({ env }) => Response.json({ orphans: await listOrphans(env.DB, env.MEDIA) })

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

export const onRequestGet = [requireAdmin, list]
export const onRequestDelete = [requireAdmin, remove]
