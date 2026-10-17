import { getUpload, type Upload } from './db'

// Rules for video uploads, shared by the /api/uploads routes.

export const MiB = 1024 * 1024
export const GiB = 1024 * MiB

// One request body per part. Workers accept up to 100 MB on the free plan; stay well under.
export const MAX_PART_BYTES = 50 * MiB
// R2 allows up to 10,000 parts per upload.
export const MAX_PARTS = 10_000
// Free R2 storage is 10 GB in all, so no single video may take a large share of it.
export const MAX_VIDEO_BYTES = 4 * GiB

// Content type is decided here from the extension, never taken from the browser.
const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export function videoContentType(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename)
  return match ? (VIDEO_TYPES[match[1].toLowerCase()] ?? null) : null
}

// Older QuickTime files may open with one of these boxes instead of 'ftyp'.
const QUICKTIME_FIRST_BOXES = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'])

// Checks the first bytes of a file really are MP4/MOV (ISO media boxes) or WebM (an EBML header).
export function looksLikeVideo(contentType: string, head: Uint8Array): boolean {
  if (head.length < 8) return false
  if (contentType === 'video/webm') {
    return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
  }
  const box = String.fromCharCode(...head.subarray(4, 8))
  return contentType === 'video/quicktime' ? QUICKTIME_FIRST_BOXES.has(box) : box === 'ftyp'
}

// Parts the client should send. Every part but the last must be the same size and at least 5 MiB (R2's rule).
export const PART_BYTES = 10 * MiB

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function uploadError(status: number, error: string, message?: string) {
  return Response.json(message ? { error, message } : { error }, { status })
}

// Loads an in-progress upload the caller started. A missing or finished upload, another user's
// upload, or a key that doesn't match all answer 404, so upload ids can't be probed.
export async function loadOwnUpload(
  db: D1Database,
  userId: number,
  uploadId: unknown,
  key: unknown,
): Promise<Upload | Response> {
  if (typeof uploadId !== 'string' || typeof key !== 'string') return uploadError(400, 'invalid_upload')
  const upload = await getUpload(db, uploadId)
  if (!upload || upload.completed_at || upload.user_id !== userId || upload.r2_key !== key) {
    return uploadError(404, 'upload_not_found')
  }
  return upload
}
