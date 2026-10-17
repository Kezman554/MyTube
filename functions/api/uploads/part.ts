import type { ApiFunction } from '../../lib/env'
import { requireRole } from '../../lib/guards'
import { uploadPart } from '../../lib/storage'
import { loadOwnUpload, looksLikeVideo, MAX_PART_BYTES, MAX_PARTS, uploadError } from '../../lib/uploads'

// PUT /api/uploads/part?uploadId=…&key=…&partNumber=n, the raw bytes of one part as the body.
// -> { partNumber, etag }. Safe to retry: sending a part number again replaces that part.
const part: ApiFunction = async ({ request, env, data }) => {
  const params = new URL(request.url).searchParams
  const upload = await loadOwnUpload(env.DB, data.user!.id, params.get('uploadId'), params.get('key'))
  if (upload instanceof Response) return upload

  const partNumber = Number(params.get('partNumber'))
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) {
    return uploadError(400, 'invalid_part_number')
  }

  // Check the declared length before reading anything, so an oversized body is never buffered.
  const declared = request.headers.get('Content-Length')
  if (declared === null) return uploadError(411, 'length_required')
  const length = Number(declared)
  if (!Number.isInteger(length) || length <= 0) return uploadError(400, 'empty_part')
  if (length > MAX_PART_BYTES) return uploadError(413, 'part_too_large', `Parts can be up to ${MAX_PART_BYTES} bytes.`)

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength !== length) return uploadError(400, 'length_mismatch')
  if (partNumber === 1 && !looksLikeVideo(upload.content_type, bytes.subarray(0, 8))) {
    return uploadError(415, 'not_a_video', "This file doesn't look like an MP4, MOV or WebM video.")
  }

  const uploaded = await uploadPart(env.MEDIA, upload.r2_key, upload.upload_id, partNumber, bytes)
  return Response.json({ partNumber: uploaded.partNumber, etag: uploaded.etag })
}

export const onRequestPut = [requireRole('creator'), part]
