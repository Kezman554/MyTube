import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { loadPlaylist, playlistError, playlistJson, playlistVideos } from '../../lib/playlists'
import { videoJson } from '../../lib/videos'

// GET /api/playlists/:id -> { playlist, videos } with the published videos in playlist order.
// Drafts are left out for everyone, their uploader and the admin included: this is the viewer's view.
const get: ApiFunction = async ({ env, params }) => {
  const playlist = await loadPlaylist(env.DB, params.id)
  if (!playlist) return playlistError(404, 'not_found')
  const videos = await playlistVideos(env.DB, playlist.id, true)
  return Response.json({ playlist: playlistJson(playlist), videos: videos.map(videoJson) })
}

export const onRequestGet = [requireApproved, get]
