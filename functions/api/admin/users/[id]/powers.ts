import { getUserById } from '../../../../lib/db'
import type { ApiFunction } from '../../../../lib/env'
import { requireAdmin } from '../../../../lib/guards'
import { isAdmin, readPowerList, setPowers, userJsonFor } from '../../../../lib/powers'

// PUT /api/admin/users/:id/powers { powers: [...] } -> { user } with powers. Admin only: only the admin
// grants or revokes. The list is the user's full set afterwards (an empty list takes every power away).
// Refused (403) for the admin's own account: the admin holds every power without rows, and no power
// makes anyone an admin. Takes effect on the user's next request. While their admin access is off, the
// admin powers stay ticked here but don't apply.
const put: ApiFunction = async ({ request, env, data, params }) => {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'not_found' }, { status: 404 })

  const body: unknown = await request.json().catch(() => null)
  const list = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).powers : undefined
  const parsed = readPowerList(list)
  if ('message' in parsed) return Response.json({ error: 'invalid_powers', message: parsed.message }, { status: 400 })

  const user = await getUserById(env.DB, id)
  if (!user) return Response.json({ error: 'not_found' }, { status: 404 })
  if (isAdmin(user)) {
    return Response.json({ error: 'cannot_change_admin', message: 'The admin already has every power.' }, { status: 403 })
  }

  await setPowers(env.DB, id, parsed.powers)
  return Response.json({ user: userJsonFor(data.user!, user, parsed.powers) })
}

export const onRequestPut = [requireAdmin, put]
