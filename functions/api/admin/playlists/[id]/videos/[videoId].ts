import type { ApiFunction } from '../../../../../lib/env'
import { requireRole } from '../../../../../lib/guards'
import { adminPlaylistJson, loadPlaylist, playlistError, removeVideo } from '../../../../../lib/playlists'

// DELETE /api/admin/playlists/:id/videos/:videoId -> { playlist }: takes the video out of the
// playlist (the video itself stays) and closes up the order.
const remove: ApiFunction = async ({ env, params }) => {
  const playlist = await loadPlaylist(env.DB, params.id)
  if (!playlist) return playlistError(404, 'not_found')
  const videoId = Number(params.videoId)
  if (!Number.isSafeInteger(videoId) || !(await removeVideo(env.DB, playlist.id, videoId))) {
    return playlistError(404, 'not_in_playlist')
  }
  return Response.json({ playlist: await adminPlaylistJson(env.DB, playlist) })
}

export const onRequestDelete = [requireRole('admin'), remove]
