import { getVideo } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { canSee, thumbnailVersion, videoError } from '../../lib/videos'

// GET /api/thumbnails/:videoId[?v=version] streams the video's thumbnail from R2.
// With the current ?v= (as in the video's thumbnail_url) the browser may keep it for a year: a new
// thumbnail gets a new v. Without it, the browser revalidates each time and gets 304 if unchanged.
// Private either way, so shared caches never hold it.
const thumbnail: ApiFunction = async ({ request, env, data, params }) => {
  const id = Number(params.id)
  const video = Number.isSafeInteger(id) && id > 0 ? await getVideo(env.DB, id) : null
  if (!video || !video.thumbnail_key || !canSee(data.user!, video)) return videoError(404, 'not_found')

  const versioned = new URL(request.url).searchParams.get('v') === thumbnailVersion(video.thumbnail_key)
  const cacheControl = versioned ? 'private, max-age=31536000, immutable' : 'private, no-cache'

  const head = await env.MEDIA.head(video.thumbnail_key)
  if (!head) return videoError(404, 'not_found')
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

  const object = await env.MEDIA.get(video.thumbnail_key)
  if (!object) return videoError(404, 'not_found')
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream')
  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { headers })
}

export const onRequestGet = [requireApproved, thumbnail]
