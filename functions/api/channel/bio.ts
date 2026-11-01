import { channelJson, getChannel, readBio, requireChannelEditor, setBio } from '../../lib/channel'
import type { ApiFunction } from '../../lib/env'
import { readJsonObject } from '../../lib/uploads'

// PUT /api/channel/bio { bio } -> { channel } (the owner or the admin). Plain text up to 500 characters
// after trimming, line breaks kept; empty clears it. 400 invalid_bio otherwise.
const put: ApiFunction = async ({ request, env, data }) => {
  const parsed = readBio((await readJsonObject(request))?.bio)
  if ('message' in parsed) return Response.json({ error: 'invalid_bio', message: parsed.message }, { status: 400 })
  await setBio(env.DB, parsed.bio)
  return Response.json({ channel: channelJson(await getChannel(env.DB), data.user!) })
}

export const onRequestPut = [requireChannelEditor, put]
