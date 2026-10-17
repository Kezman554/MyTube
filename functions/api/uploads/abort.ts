import { deleteUpload } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireRole } from '../../lib/guards'
import { abortMultipartUpload } from '../../lib/storage'
import { loadOwnUpload, readJsonObject, uploadError } from '../../lib/uploads'

// POST /api/uploads/abort { uploadId, key } -> { ok: true }. Discards the parts sent so far.
const abort: ApiFunction = async ({ request, env, data }) => {
  const body = await readJsonObject(request)
  if (!body) return uploadError(400, 'invalid_body', 'Send a JSON object.')
  const upload = await loadOwnUpload(env.DB, data.user!.id, body.uploadId, body.key)
  if (upload instanceof Response) return upload

  try {
    await abortMultipartUpload(env.MEDIA, upload.r2_key, upload.upload_id)
  } catch {
    // Already gone on R2's side (expired or aborted): forgetting it below is all that's left to do.
  }
  await deleteUpload(env.DB, upload.upload_id)
  return Response.json({ ok: true })
}

export const onRequestPost = [requireRole('creator'), abort]
