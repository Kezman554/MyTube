// R2 access for videos and thumbnails. The bucket is private: objects only
// ever leave through getObject, behind the API's approval check.

export const VIDEO_PREFIX = 'videos/'
export const THUMBNAIL_PREFIX = 'thumbnails/'

const PREFIXES = [VIDEO_PREFIX, THUMBNAIL_PREFIX]

function assertKey(key: string): void {
  if (!PREFIXES.some((p) => key.startsWith(p) && key.length > p.length) || key.includes('..')) {
    throw new Error(`Invalid storage key: ${key}`)
  }
}

function extension(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename)
  return match ? `.${match[1].toLowerCase()}` : ''
}

export function newVideoKey(filename: string): string {
  return `${VIDEO_PREFIX}${crypto.randomUUID()}${extension(filename)}`
}

export function newThumbnailKey(filename: string): string {
  return `${THUMBNAIL_PREFIX}${crypto.randomUUID()}${extension(filename)}`
}

export async function putObject(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
  contentType: string,
): Promise<R2Object> {
  assertKey(key)
  return bucket.put(key, body, { httpMetadata: { contentType } })
}

export async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  assertKey(key)
  await bucket.delete(key)
}

export type ByteRange = { start: number; end: number } // inclusive

/**
 * Resolves a Range header against an object size. Returns null when there is
 * no usable single range (serve the whole object), or 'unsatisfiable' (416).
 * Multi-range requests are answered with the whole object, which RFC 9110 allows.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, from, to] = match
  if (from === '' && to === '') return null
  if (size === 0) return 'unsatisfiable'

  if (from === '') {
    const suffix = Number(to)
    if (suffix === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(from)
  if (start >= size) return 'unsatisfiable'
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (end < start) return null
  return { start, end }
}

/**
 * Streams an object as a Response, honouring a single HTTP Range.
 * Returns null when the key does not exist.
 */
export async function getObject(bucket: R2Bucket, key: string, rangeHeader: string | null = null): Promise<Response | null> {
  assertKey(key)

  if (!rangeHeader) {
    const object = await bucket.get(key)
    if (!object) return null
    return new Response(object.body, { status: 200, headers: objectHeaders(object, object.size) })
  }

  const head = await bucket.head(key)
  if (!head) return null
  const range = parseRange(rangeHeader, head.size)

  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${head.size}`, 'Accept-Ranges': 'bytes' },
    })
  }

  if (!range) {
    const object = await bucket.get(key)
    if (!object) return null
    return new Response(object.body, { status: 200, headers: objectHeaders(object, object.size) })
  }

  const length = range.end - range.start + 1
  const object = await bucket.get(key, { range: { offset: range.start, length } })
  if (!object) return null
  const headers = objectHeaders(object, length)
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${object.size}`)
  return new Response(object.body, { status: 206, headers })
}

function objectHeaders(object: R2Object, length: number): Headers {
  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream')
  headers.set('Content-Length', String(length))
  headers.set('Accept-Ranges', 'bytes')
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'private, no-store')
  return headers
}

// Multipart uploads, for videos too large for one request body.
// Parts other than the last must be at least 5 MiB and all the same size.

export async function createMultipartUpload(
  bucket: R2Bucket,
  key: string,
  contentType: string,
): Promise<{ key: string; uploadId: string }> {
  assertKey(key)
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType } })
  return { key: upload.key, uploadId: upload.uploadId }
}

export async function uploadPart(
  bucket: R2Bucket,
  key: string,
  uploadId: string,
  partNumber: number,
  body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
): Promise<R2UploadedPart> {
  assertKey(key)
  return bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, body)
}

export async function completeMultipartUpload(
  bucket: R2Bucket,
  key: string,
  uploadId: string,
  parts: R2UploadedPart[],
): Promise<R2Object> {
  assertKey(key)
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
  return bucket.resumeMultipartUpload(key, uploadId).complete(sorted)
}

export async function abortMultipartUpload(bucket: R2Bucket, key: string, uploadId: string): Promise<void> {
  assertKey(key)
  await bucket.resumeMultipartUpload(key, uploadId).abort()
}
