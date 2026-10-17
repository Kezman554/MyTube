import { deleteUpload } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireRole } from '../../lib/guards'
import { completeMultipartUpload, deleteObject } from '../../lib/storage'
import { loadOwnUpload, MAX_PARTS, readJsonObject, uploadError } from '../../lib/uploads'

// POST /api/uploads/complete { uploadId, key, parts: [{ partNumber, etag }] } -> { key, size }
// Joins the parts into one object and checks it is exactly the size declared at start.
const complete: ApiFunction = async ({ request, env, data }) => {
  const body = await readJsonObject(request)
  if (!body) return uploadError(400, 'invalid_body', 'Send a JSON object.')
  const upload = await loadOwnUpload(env.DB, data.user!.id, body.uploadId, body.key)
  if (upload instanceof Response) return upload

  const parts = parseParts(body.parts)
  if (!parts) return uploadError(400, 'invalid_parts', 'Send each part as { partNumber, etag }.')

  let object: R2Object
  try {
    object = await completeMultipartUpload(env.MEDIA, upload.r2_key, upload.upload_id, parts)
  } catch {
    // Usually a missing part or a wrong etag. The upload is left open so the client can fix it or abort.
    return uploadError(400, 'complete_failed', "The video's parts couldn't be joined. Try uploading again.")
  }

  await deleteUpload(env.DB, upload.upload_id)
  if (object.size !== upload.size) {
    await deleteObject(env.MEDIA, upload.r2_key)
    return uploadError(400, 'size_mismatch', 'The uploaded video is incomplete. Try uploading again.')
  }
  return Response.json({ key: upload.r2_key, size: object.size })
}

function parseParts(value: unknown): R2UploadedPart[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PARTS) return null
  const parts: R2UploadedPart[] = []
  for (const item of value) {
    const { partNumber, etag } = (item ?? {}) as Record<string, unknown>
    if (!Number.isInteger(partNumber) || typeof etag !== 'string' || !etag) return null
    parts.push({ partNumber: partNumber as number, etag })
  }
  return parts
}

export const onRequestPost = [requireRole('creator'), complete]
