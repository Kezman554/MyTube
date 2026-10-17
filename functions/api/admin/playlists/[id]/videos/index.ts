import { getVideo } from '../../../../../lib/db'
import type { ApiFunction } from '../../../../../lib/env'
import { requireRole } from '../../../../../lib/guards'
import { adminPlaylistJson, appendVideo, loadPlaylist, playlistError } from '../../../../../lib/playlists'
import { readJsonObject } from '../../../../../lib/uploads'

// POST /api/admin/playlists/:id/videos { videoId } -> 201 { playlist }: adds the video at the end.
// A draft may be added: viewers see it in the playlist once it is published.
const add: ApiFunction = async ({ request, env, params }) => {
  const playlist = await loadPlaylist(env.DB, params.id)
  if (!playlist) return playlistError(404, 'not_found')
  const body = await readJsonObject(request)
  const videoId = body?.videoId
  if (typeof videoId !== 'number' || !Number.isSafeInteger(videoId) || videoId <= 0) {
    return playlistError(400, 'invalid_video_id', 'Send the video id as videoId.')
  }
  if (!(await getVideo(env.DB, videoId))) return playlistError(404, 'video_not_found')

  try {
    await appendVideo(env.DB, playlist.id, videoId)
  } catch (err) {
    if (String(err).includes('UNIQUE') || String(err).includes('PRIMARY KEY')) {
      return playlistError(409, 'already_in_playlist', 'That video is already in this playlist.')
    }
    throw err
  }
  return Response.json({ playlist: await adminPlaylistJson(env.DB, playlist) }, { status: 201 })
}

export const onRequestPost = [requireRole('admin'), add]
