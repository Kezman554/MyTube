import { all, first, run, VIDEO_COUNTS, type Playlist, type Video, type VideoCounts } from './db'
import { DESCRIPTION_MAX, thumbnailUrl, TITLE_MAX, videoError, videoJson } from './videos'

// Playlists: an ordered list of videos, managed by the admin. Positions run 1..n within a playlist;
// a gap (left when a video is deleted elsewhere) is harmless, since everything orders by position.

export function playlistError(status: number, error: string, message?: string) {
  return videoError(status, error, message)
}

export function loadPlaylist(db: D1Database, id: string | string[] | undefined) {
  const n = Number(id)
  return Number.isSafeInteger(n) && n > 0 ? first<Playlist>(db, 'SELECT * FROM playlists WHERE id = ?', n) : Promise.resolve(null)
}

// The videos in a playlist, in order. Viewers get published videos only.
export function playlistVideos(db: D1Database, playlistId: number, publishedOnly: boolean) {
  return all<Video & VideoCounts & { position: number }>(
    db,
    `SELECT videos.*, ${VIDEO_COUNTS}, playlist_videos.position FROM playlist_videos
     JOIN videos ON videos.id = playlist_videos.video_id
     WHERE playlist_videos.playlist_id = ? ${publishedOnly ? "AND videos.status = 'published'" : ''}
     ORDER BY playlist_videos.position, videos.id`,
    playlistId,
  )
}

// Viewer summaries: playlists with at least one published video, newest first, each with its
// published video count and the first published video's thumbnail as its cover.
export async function listPlaylistSummaries(db: D1Database) {
  const cover = (column: string) => `(SELECT v.${column} FROM playlist_videos pv JOIN videos v ON v.id = pv.video_id
     WHERE pv.playlist_id = playlists.id AND v.status = 'published' AND v.thumbnail_key IS NOT NULL
     ORDER BY pv.position, v.id LIMIT 1)`
  const rows = await all<Playlist & { video_count: number; cover_id: number | null; cover_key: string | null }>(
    db,
    `SELECT playlists.*, COUNT(videos.id) AS video_count, ${cover('id')} AS cover_id, ${cover('thumbnail_key')} AS cover_key
     FROM playlists
     JOIN playlist_videos ON playlist_videos.playlist_id = playlists.id
     JOIN videos ON videos.id = playlist_videos.video_id AND videos.status = 'published'
     GROUP BY playlists.id
     ORDER BY playlists.created_at DESC, playlists.id DESC`,
  )
  return rows.map(({ cover_id, cover_key, video_count, ...playlist }) => ({
    ...playlistJson(playlist),
    video_count,
    thumbnail_url: cover_id !== null && cover_key ? thumbnailUrl(cover_id, cover_key) : null,
  }))
}

export function playlistJson(playlist: Playlist) {
  return { id: playlist.id, title: playlist.title, description: playlist.description, created_at: playlist.created_at }
}

// Title (required when creating, never blank) and description, from a JSON body.
export function readPlaylistFields(
  body: Record<string, unknown>,
  creating: boolean,
): { title?: string; description?: string } | Response {
  const fields: { title?: string; description?: string } = {}
  if (body.title !== undefined || creating) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return playlistError(400, 'invalid_title', 'Give the playlist a title.')
    }
    if (body.title.trim().length > TITLE_MAX) {
      return playlistError(400, 'invalid_title', `The title can be up to ${TITLE_MAX} characters.`)
    }
    fields.title = body.title.trim()
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') return playlistError(400, 'invalid_description')
    if (body.description.trim().length > DESCRIPTION_MAX) {
      return playlistError(400, 'invalid_description', `The description can be up to ${DESCRIPTION_MAX} characters.`)
    }
    fields.description = body.description.trim()
  }
  return fields
}

export function createPlaylist(db: D1Database, title: string, description: string) {
  return first<Playlist>(db, 'INSERT INTO playlists (title, description) VALUES (?, ?) RETURNING *', title, description)
}

export function updatePlaylist(db: D1Database, id: number, fields: { title?: string; description?: string }) {
  return first<Playlist>(
    db,
    'UPDATE playlists SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ? RETURNING *',
    fields.title ?? null,
    fields.description ?? null,
    id,
  )
}

// Entries go with it (ON DELETE CASCADE); the videos themselves stay.
export function deletePlaylist(db: D1Database, id: number) {
  return run(db, 'DELETE FROM playlists WHERE id = ?', id)
}

// Adds a video at the end, in one statement so two adds can't take the same position.
export function appendVideo(db: D1Database, playlistId: number, videoId: number) {
  return run(
    db,
    `INSERT INTO playlist_videos (playlist_id, video_id, position)
     SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM playlist_videos WHERE playlist_id = ?`,
    playlistId,
    videoId,
    playlistId,
  )
}

// Removes a video and closes the gap it leaves, together.
export async function removeVideo(db: D1Database, playlistId: number, videoId: number) {
  const entry = await first<{ position: number }>(
    db,
    'SELECT position FROM playlist_videos WHERE playlist_id = ? AND video_id = ?',
    playlistId,
    videoId,
  )
  if (!entry) return false
  await db.batch([
    db.prepare('DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?').bind(playlistId, videoId),
    db
      .prepare('UPDATE playlist_videos SET position = position - 1 WHERE playlist_id = ? AND position > ?')
      .bind(playlistId, entry.position),
  ])
  return true
}

// Rewrites the order as positions 1..n, all in one batch (a D1 batch is a single transaction).
export async function setOrder(db: D1Database, playlistId: number, videoIds: number[]) {
  await db.batch(
    videoIds.map((videoId, i) =>
      db.prepare('UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?').bind(i + 1, playlistId, videoId),
    ),
  )
}

// The admin's view: every video in order, drafts included and marked by their status.
export async function adminPlaylistJson(db: D1Database, playlist: Playlist) {
  const videos = await playlistVideos(db, playlist.id, false)
  return { ...playlistJson(playlist), videos: videos.map(videoJson) }
}
