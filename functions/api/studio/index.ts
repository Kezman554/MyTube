import { requireChannelEditor } from '../../lib/channel'
import { first } from '../../lib/db'
import type { ApiFunction } from '../../lib/env'
import { studio } from '../../lib/studio'

// GET /api/studio (the channel's owner, or the admin) ->
//   { since: last visit | null, as_of, totals: { videos, views, likes, comments: { total, new } },
//     videos: [{ id, title, status, published_at, created_at, thumbnail_url, views, likes, comments }],
//     comments: [{ id, body, created_at, user, video: { id, title }, is_reply, link, new }] }
// Videos are every published one plus the owner's drafts, newest first; comments the 50 newest on the
// channel. "new" counts what arrived since the caller's own last visit (everything on a first visit).
// Reading doesn't mark a visit: the page sends POST /api/studio/seen { seen_at: as_of } once shown.
const get: ApiFunction = async ({ env, data }) => {
  const owner = await first<{ owner_user_id: number | null }>(env.DB, 'SELECT owner_user_id FROM channel WHERE id = 1')
  return Response.json(await studio(env.DB, data.user!.id, owner?.owner_user_id ?? null))
}

export const onRequestGet = [requireChannelEditor, get]
