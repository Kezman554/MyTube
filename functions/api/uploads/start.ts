import { createUpload } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireRole } from '../../lib/guards'
import { createMultipartUpload, newVideoKey } from '../../lib/storage'
import { MAX_VIDEO_BYTES, PART_BYTES, readJsonObject, uploadError, videoContentType } from '../../lib/uploads'

// POST /api/uploads/start { filename, size } -> { uploadId, key, partSize }
// Starts an R2 multipart upload. The client then sends partSize-byte parts to /api/uploads/part.
const start: ApiFunction = async ({ request, env, data }) => {
  const body = await readJsonObject(request)
  if (!body) return uploadError(400, 'invalid_body', 'Send a JSON object.')
  const { filename, size } = body

  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255) {
    return uploadError(400, 'invalid_filename', 'Send the file name.')
  }
  const contentType = videoContentType(filename)
  if (!contentType) return uploadError(415, 'unsupported_type', 'Only MP4, MOV and WebM videos can be uploaded.')
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    return uploadError(400, 'invalid_size', 'Send the file size in bytes.')
  }
  if (size > MAX_VIDEO_BYTES) {
    return uploadError(413, 'too_large', `Videos can be up to ${MAX_VIDEO_BYTES / 1024 ** 3} GB.`)
  }

  const { key, uploadId } = await createMultipartUpload(env.MEDIA, newVideoKey(filename), contentType)
  await createUpload(env.DB, {
    upload_id: uploadId,
    r2_key: key,
    user_id: data.user!.id,
    filename: filename.trim(),
    content_type: contentType,
    size,
  })
  return Response.json({ uploadId, key, partSize: PART_BYTES }, { status: 201 })
}

export const onRequestPost = [requireRole('creator'), start]
