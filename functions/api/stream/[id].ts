import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { getObject } from '../../lib/storage'
import { callerCanSee, loadVideo, videoError } from '../../lib/videos'

// GET /api/stream/:videoId streams the video file from R2 for the <video> element. Honours a single
// HTTP Range (206 with Content-Range; 416 when past the end) so the player can seek, and always sends
// Accept-Ranges: bytes. Published videos for every approved user; a draft for its uploader, the
// admin and reviewers (see canSee). The file is never public: it only ever leaves R2 through here.
const stream: ApiFunction = async (context) => {
  const { request, env, params } = context
  const video = await loadVideo(env.DB, params.id)
  if (!video || !(await callerCanSee(context, video))) return videoError(404, 'not_found')

  const res = await getObject(env.MEDIA, video.r2_key, request.headers.get('Range'))
  if (!res) return videoError(404, 'not_found')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  return res
}

export const onRequestGet = [requireApproved, stream]
