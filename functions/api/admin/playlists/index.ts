import { all, type Playlist } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'
import { adminPlaylistJson, createPlaylist, readPlaylistFields } from '../../../lib/playlists'
import { readJsonObject } from '../../../lib/uploads'
import { videoError } from '../../../lib/videos'

// GET /api/admin/playlists -> { playlists }: every playlist, newest first, each with all its videos
// in order, drafts included (marked by status).
const list: ApiFunction = async ({ env }) => {
  const playlists = await all<Playlist>(env.DB, 'SELECT * FROM playlists ORDER BY created_at DESC, id DESC')
  return Response.json({ playlists: await Promise.all(playlists.map((p) => adminPlaylistJson(env.DB, p))) })
}

// POST /api/admin/playlists { title, description? } -> 201 { playlist }
const create: ApiFunction = async ({ request, env }) => {
  const body = await readJsonObject(request)
  if (!body) return videoError(400, 'invalid_body', 'Send a JSON object.')
  const fields = readPlaylistFields(body, true)
  if (fields instanceof Response) return fields
  const playlist = await createPlaylist(env.DB, fields.title!, fields.description ?? '')
  return Response.json({ playlist: await adminPlaylistJson(env.DB, playlist!) }, { status: 201 })
}

export const onRequestGet = [requireRole('admin'), list]
export const onRequestPost = [requireRole('admin'), create]
