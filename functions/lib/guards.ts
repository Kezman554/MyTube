import type { Role } from './db'
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

// Admin outranks creator, so requireRole('creator') also admits admins.
const RANK: Record<Role, number> = { viewer: 0, creator: 1, admin: 2 }

export function requireRole(role: 'admin' | 'creator'): ApiFunction {
  return (context) => {
    const { user } = context.data
    if (!user || user.status !== 'approved') return requireApproved(context)
    if (RANK[user.role] < RANK[role]) return forbidden('forbidden')
    return context.next()
  }
}
