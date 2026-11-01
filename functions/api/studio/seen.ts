import { requireChannelEditor } from '../../lib/channel'
import type { ApiFunction } from '../../lib/env'
import { markSeen, SEEN_AT } from '../../lib/studio'
import { readJsonObject } from '../../lib/uploads'

// POST /api/studio/seen { seen_at } (the channel's owner, or the admin) -> { seen_at }: marks the
// caller's Studio visit as of seen_at, the as_of from the GET whose "new" figures the page has shown.
// Clamped to now, and never moves backwards, so a stale tab can't bring old news back.
const seen: ApiFunction = async ({ request, env, data }) => {
  const seenAt = (await readJsonObject(request))?.seen_at
  if (typeof seenAt !== 'string' || !SEEN_AT.test(seenAt)) {
    return Response.json({ error: 'invalid_seen_at', message: 'Send seen_at as returned by GET /api/studio.' }, { status: 400 })
  }
  return Response.json({ seen_at: await markSeen(env.DB, data.user!.id, seenAt) })
}

export const onRequestPost = [requireChannelEditor, seen]
