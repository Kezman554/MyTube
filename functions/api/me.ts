import { canEditChannel } from '../lib/channel'
import type { ApiFunction } from '../lib/env'
import { powersOf } from '../lib/guards'

// Deliberately unguarded: pending and unregistered users need this to know which screen to show.
// powers: what the caller may do beyond watching and commenting (every power for the admin), read
// fresh on every request. edits_channel: whether Channel settings is theirs (the owner or the admin).
export const onRequestGet: ApiFunction = async (context) => {
  const { data, env } = context
  const approved = data.user?.status === 'approved'
  return Response.json({
    email: data.email,
    user: data.user,
    status: data.user?.status ?? 'unregistered',
    powers: [...(await powersOf(context))],
    edits_channel: approved ? await canEditChannel(env.DB, data.user!) : false,
  })
}
