import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { getObject } from '../../lib/storage'
import { canSee, loadVideo, videoError } from '../../lib/videos'

// GET /api/stream/:videoId streams the video file from R2 for the <video> element. Honours a single
// HTTP Range (206 with Content-Range; 416 when past the end) so the player can seek, and always sends
// Accept-Ranges: bytes. Published videos for every approved user; a draft for its uploader and the
// admin only. The file is never public: it only ever leaves R2 through here.
const stream: ApiFunction = async ({ request, env, data, params }) => {
  const video = await loadVideo(env.DB, params.id)
  if (!video || !canSee(data.user!, video)) return videoError(404, 'not_found')

  const res = await getObject(env.MEDIA, video.r2_key, request.headers.get('Range'))
  if (!res) return videoError(404, 'not_found')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  return res
}

export const onRequestGet = [requireApproved, stream]
