// Images in R2 (video thumbnails, the channel banner): what counts as one, and how one is served.

// The type is decided from the file's first bytes, never from its name or what the browser says.
const IMAGE_TYPES = [
  { type: 'image/jpeg', ext: 'jpg', matches: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    matches: (b: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    type: 'image/webp',
    ext: 'webp',
    matches: (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  },
]

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.subarray(from, to))
}

// JPG, PNG or WebP by its bytes, or null.
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const kind = IMAGE_TYPES.find((t) => t.matches(bytes))
  return kind ? { type: kind.type, ext: kind.ext } : null
}

// A key's version: the start of its random file name, so a new image gets a new ?v=.
export function imageVersion(key: string) {
  return key.slice(key.lastIndexOf('/') + 1, key.lastIndexOf('/') + 9)
}

// Streams an image from R2. With the current ?v= the browser may keep it for a year (a new image
// gets a new v); without it, the browser revalidates each time and gets 304 if unchanged. Private
// either way, so shared caches never hold it. Callers check who may see it first.
export async function serveImage(request: Request, bucket: R2Bucket, key: string): Promise<Response | null> {
  const versioned = new URL(request.url).searchParams.get('v') === imageVersion(key)
  const cacheControl = versioned ? 'private, max-age=31536000, immutable' : 'private, no-cache'

  const head = await bucket.head(key)
  if (!head) return null
  const headers = new Headers({
    ETag: head.httpEtag,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  })
  // The browser's copy is current.
  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch?.split(',').some((tag) => tag.trim().replace(/^W\//, '') === head.httpEtag)) {
    return new Response(null, { status: 304, headers })
  }

  const object = await bucket.get(key)
  if (!object) return null
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream')
  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { headers })
}
