import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { listPlaylistSummaries } from '../../lib/playlists'

// GET /api/playlists -> { playlists: [{ id, title, description, created_at, video_count, thumbnail_url }] }
// Only playlists with at least one published video; counts and covers count published videos only.
const list: ApiFunction = async ({ env }) => Response.json({ playlists: await listPlaylistSummaries(env.DB) })

export const onRequestGet = [requireApproved, list]
