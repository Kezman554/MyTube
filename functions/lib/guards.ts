import { isAdmin, loadPowers, type Power } from './powers'
import type { ApiFunction } from './env'

// Guards are Pages handlers: put them before the route handler, e.g.
//   export const onRequestGet = [requireApproved, handler]
// They answer 403 themselves or pass on to the next handler.

function forbidden(error: string) {
  return Response.json({ error }, { status: 403 })
}

export const requireApproved: ApiFunction = ({ data, next }) => {
  if (!data.user) return forbidden('not_registered')
  if (data.user.status !== 'approved') return forbidden(data.user.status)
  return next()
}

type Context = Parameters<ApiFunction>[0]

// The caller's powers for this request. The middleware loads them fresh on every request; a handler
// run without it (tests) loads them here, once per request. The admin holds every power.
export async function powersOf(context: Pick<Context, 'data' | 'env'>): Promise<ReadonlySet<Power>> {
  const { data, env } = context
  if (!data.powers) data.powers = data.user ? await loadPowers(env.DB, data.user) : []
  return new Set(data.powers)
}

// Admits an approved caller holding any one of these powers (the admin holds them all).
export function requirePower(...powers: [Power, ...Power[]]): ApiFunction {
  return async (context) => {
    const { user } = context.data
    if (!user || user.status !== 'approved') return requireApproved(context)
    const held = await powersOf(context)
    if (!powers.some((p) => held.has(p))) return forbidden('forbidden')
    return context.next()
  }
}

// What no power covers: the admin only.
export const requireAdmin: ApiFunction = (context) => {
  const { user } = context.data
  if (!user || user.status !== 'approved') return requireApproved(context)
  if (!isAdmin(user)) return forbidden('forbidden')
  return context.next()
}

// Nothing done under a power may act on the admin: muting or removing them, deleting their comments,
// publishing or rejecting their drafts. The admin acting on their own account is not under a power.
export function actsOnAdmin(caller: { role: string }, targetIsAdmin: boolean) {
  return targetIsAdmin && !isAdmin(caller)
}

export function cannotActOnAdmin(message = "That belongs to the admin, so it can't be changed here.") {
  return Response.json({ error: 'cannot_act_on_admin', message }, { status: 403 })
}
