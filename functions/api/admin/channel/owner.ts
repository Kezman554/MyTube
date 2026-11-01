import { channelJson, getChannel, setOwner } from '../../../lib/channel'
import { getUserById } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireAdmin } from '../../../lib/guards'
import { readJsonObject } from '../../../lib/uploads'

// PUT /api/admin/channel/owner { user_id: number | null } -> { channel } (admin only). One owner at a
// time: setting another moves the channel to them. The owner must be an approved user (400
// invalid_owner otherwise); null leaves the channel with no owner (the admin still edits it).
const put: ApiFunction = async ({ request, env, data }) => {
  const body = await readJsonObject(request)
  const id = body?.user_id
  if (id !== null && !(typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    return Response.json({ error: 'invalid_owner', message: 'Send user_id: a user, or null.' }, { status: 400 })
  }
  if (id !== null) {
    const user = await getUserById(env.DB, id)
    if (!user) return Response.json({ error: 'not_found' }, { status: 404 })
    if (user.status !== 'approved') {
      return Response.json({ error: 'invalid_owner', message: 'Only an approved user can own the channel.' }, { status: 400 })
    }
  }
  await setOwner(env.DB, id)
  return Response.json({ channel: channelJson(await getChannel(env.DB), data.user!) })
}

export const onRequestPut = [requireAdmin, put]
