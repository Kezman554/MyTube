import { all } from '../../../../lib/db'
import type { ApiFunction } from '../../../../lib/env'
import { requireRole } from '../../../../lib/guards'
import { adminPlaylistJson, loadPlaylist, playlistError, setOrder } from '../../../../lib/playlists'
import { readJsonObject } from '../../../../lib/uploads'

// PUT /api/admin/playlists/:id/order { videoIds: [ … ] } -> { playlist }
// videoIds is the whole playlist in its new order: exactly the videos already in it, each once.
// Anything else is refused rather than guessed at, so a stale page can't scramble the order.
const reorder: ApiFunction = async ({ request, env, params }) => {
  const playlist = await loadPlaylist(env.DB, params.id)
  if (!playlist) return playlistError(404, 'not_found')
  const body = await readJsonObject(request)
  const videoIds = body?.videoIds
  if (!Array.isArray(videoIds) || !videoIds.every((id) => Number.isSafeInteger(id))) {
    return playlistError(400, 'invalid_order', 'Send videoIds as a list of video ids.')
  }

  const current = await all<{ video_id: number }>(env.DB, 'SELECT video_id FROM playlist_videos WHERE playlist_id = ?', playlist.id)
  const wanted = new Set(videoIds as number[])
  if (wanted.size !== videoIds.length || wanted.size !== current.length || !current.every((r) => wanted.has(r.video_id))) {
    return playlistError(409, 'order_mismatch', 'The playlist has changed. Reload it and try again.')
  }

  if (videoIds.length > 0) await setOrder(env.DB, playlist.id, videoIds as number[])
  return Response.json({ playlist: await adminPlaylistJson(env.DB, playlist) })
}

export const onRequestPut = [requireRole('admin'), reorder]
