import { getUserById, updateUser, type UserChanges } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { actsOnAdmin, cannotActOnAdmin, powersOf, requirePower } from '../../../lib/guards'
import { isAdmin, loadPowers, userWithPowers } from '../../../lib/powers'

function badRequest(error: string, message: string) {
  return Response.json({ error, message }, { status: 400 })
}

const forbidden = () => Response.json({ error: 'forbidden' }, { status: 403 })

// PATCH /api/admin/users/:id with any of
//   { status: 'approved' | 'removed' }   approve_users: approve, or reject/remove
//   { can_comment: boolean }             moderate_comments: mute or unmute
// The route admits either power; each field then needs its own. Nobody's role changes here (only the
// ADMIN_EMAIL account is admin; powers are PUT /api/admin/users/:id/powers). Nothing done under a
// power may act on the admin (403), and nobody can remove themselves. -> { user } with powers
const patch: ApiFunction = async (context) => {
  const { request, env, data, params } = context
  const caller = data.user!
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'not_found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error()
  } catch {
    return badRequest('invalid_body', 'Send a JSON object.')
  }

  if (body.role !== undefined) {
    return badRequest('invalid_role', 'Roles no longer change here. Give or take away powers instead.')
  }
  const changes: UserChanges = {}
  if (body.status !== undefined) {
    if (body.status !== 'approved' && body.status !== 'removed') {
      return badRequest('invalid_status', "status must be 'approved' or 'removed'.")
    }
    changes.status = body.status
  }
  if (body.can_comment !== undefined) {
    if (typeof body.can_comment !== 'boolean') return badRequest('invalid_can_comment', 'can_comment must be true or false.')
    changes.can_comment = body.can_comment ? 1 : 0
  }
  if (Object.keys(changes).length === 0) {
    return badRequest('no_changes', 'Send at least one of status or can_comment.')
  }

  const powers = await powersOf(context)
  if (changes.status !== undefined && !powers.has('approve_users')) return forbidden()
  if (changes.can_comment !== undefined && !powers.has('moderate_comments')) return forbidden()

  if (id === caller.id && changes.status === 'removed') {
    return Response.json({ error: 'cannot_change_self', message: "You can't remove yourself." }, { status: 403 })
  }

  const target = await getUserById(env.DB, id)
  if (!target) return Response.json({ error: 'not_found' }, { status: 404 })
  if (actsOnAdmin(caller, isAdmin(target))) return cannotActOnAdmin("That's the admin's account, so it can't be changed here.")

  const user = (await updateUser(env.DB, id, changes))!
  return Response.json({ user: userWithPowers(user, await loadPowers(env.DB, user)) })
}

export const onRequestPatch = [requirePower('approve_users', 'moderate_comments'), patch]
