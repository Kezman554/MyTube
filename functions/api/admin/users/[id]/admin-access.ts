import { first, getChannelOwnerId, getUserById, type User } from '../../../../lib/db'
import type { ApiFunction } from '../../../../lib/env'
import { powersOf, requireAdmin } from '../../../../lib/guards'
import { isAdmin, loadStoredPowers, userJsonFor } from '../../../../lib/powers'

// PUT /api/admin/users/:id/admin-access { admin_access: boolean } -> { user } with powers and admin_access.
// Admin only. Off suspends the user's admin powers (manage_playlists, moderate_comments, review_drafts,
// approve_users) everywhere from their next request; their ticks are kept, so on restores them exactly.
// upload and publish_own are unaffected. Refused (403) for the admin's own account.
const put: ApiFunction = async (context) => {
  const { request, env, data, params } = context
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'not_found' }, { status: 404 })

  const body: unknown = await request.json().catch(() => null)
  const on = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).admin_access : undefined
  if (typeof on !== 'boolean') {
    return Response.json({ error: 'invalid_admin_access', message: 'admin_access must be true or false.' }, { status: 400 })
  }

  const target = await getUserById(env.DB, id)
  if (!target) return Response.json({ error: 'not_found' }, { status: 404 })
  if (isAdmin(target)) {
    return Response.json({ error: 'cannot_change_admin', message: "The admin's own access can't be switched off." }, { status: 403 })
  }

  const user = (await first<User>(env.DB, 'UPDATE users SET admin_access = ? WHERE id = ? RETURNING *', on ? 1 : 0, id))!
  const viewer = { user: data.user!, powers: await powersOf(context) }
  return Response.json({ user: userJsonFor(viewer, user, await loadStoredPowers(env.DB, id), await getChannelOwnerId(env.DB)) })
}

export const onRequestPut = [requireAdmin, put]
