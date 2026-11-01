import { getVideo } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { serveImage } from '../../lib/images'
import { callerCanSee, videoError } from '../../lib/videos'

// GET /api/thumbnails/:videoId[?v=version] streams the video's thumbnail from R2.
// With the current ?v= (as in the video's thumbnail_url) the browser may keep it for a year: a new
// thumbnail gets a new v. Without it, the browser revalidates each time and gets 304 if unchanged.
// Private either way, so shared caches never hold it.
const thumbnail: ApiFunction = async (context) => {
  const { request, env, params } = context
  const id = Number(params.id)
  const video = Number.isSafeInteger(id) && id > 0 ? await getVideo(env.DB, id) : null
  if (!video || !video.thumbnail_key || !(await callerCanSee(context, video))) return videoError(404, 'not_found')
  return (await serveImage(request, env.MEDIA, video.thumbnail_key)) ?? videoError(404, 'not_found')
}

export const onRequestGet = [requireApproved, thumbnail]
