import { channelJson, getChannel } from '../../lib/channel'
import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'

// GET /api/channel -> { channel: { owner: { id, username } | null, bio, banner_url | null, can_edit,
// updated_at } }. banner_url is versioned (see GET /api/channel/banner); null means the built-in banner.
const get: ApiFunction = async ({ env, data }) => {
  return Response.json({ channel: channelJson(await getChannel(env.DB), data.user!) })
}

export const onRequestGet = [requireApproved, get]
