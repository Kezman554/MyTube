import type { ApiFunction } from '../../../../lib/env'
import { requireRole } from '../../../../lib/guards'
import {
  adminPlaylistJson,
  deletePlaylist,
  loadPlaylist,
  playlistError,
  readPlaylistFields,
  updatePlaylist,
} from '../../../../lib/playlists'
import { readJsonObject } from '../../../../lib/uploads'

// PATCH /api/admin/playlists/:id { title?, description? } -> { playlist }
const patch: ApiFunction = async ({ request, env, params }) => {
  const playlist = await loadPlaylist(env.DB, params.id)
  if (!playlist) return playlistError(404, 'not_found')
  const body = await readJsonObject(request)
  if (!body) return playlistError(400, 'invalid_body', 'Send a JSON object.')
  const fields = readPlaylistFields(body, false)
  if (fields instanceof Response) return fields
  if (fields.title === undefined && fields.description === undefined) {
    return playlistError(400, 'no_changes', 'Send a title or description.')
  }
  const updated = await updatePlaylist(env.DB, playlist.id, fields)
  return Response.json({ playlist: await adminPlaylistJson(env.DB, updated!) })
}

// DELETE /api/admin/playlists/:id -> { ok: true }. The videos in it are not touched.
const remove: ApiFunction = async ({ env, params }) => {
  const playlist = await loadPlaylist(env.DB, params.id)
  if (!playlist) return playlistError(404, 'not_found')
  await deletePlaylist(env.DB, playlist.id)
  return Response.json({ ok: true })
}

export const onRequestPatch = [requireRole('admin'), patch]
export const onRequestDelete = [requireRole('admin'), remove]
