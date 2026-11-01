import { dashboard } from '../../lib/dashboard'
import type { ApiFunction } from '../../lib/env'
import { requireAdmin } from '../../lib/guards'

// GET /api/admin/dashboard (admin only: no power covers it) ->
//   { generated_at,
//     attention: { pending_users, drafts, leftover_uploads: { count, bytes } },
//     week: { views, likes, comments, users: { current, previous } }   last 7 days vs the 7 before
//     watchers: [{ id, username, is_admin, views_7d, last_view_at }]   approved users, most active first
//     top_videos: [{ id, title, thumbnail_url, views_30d }]             top 5 by views, last 30 days
//     storage: { bytes, objects, by_prefix: { videos, thumbnails, banners }, free_tier_bytes,
//                rows: { users, videos, comments } } }
// Storage lists every object in R2 (paginated), so this costs a few list operations per load.
const get: ApiFunction = async ({ env }) => Response.json(await dashboard(env.DB, env.MEDIA))

export const onRequestGet = [requireAdmin, get]
