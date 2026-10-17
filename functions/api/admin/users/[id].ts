import { getUserById, updateUser, type UserChanges } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'

function badRequest(error: string, message: string) {
  return Response.json({ error, message }, { status: 400 })
}

// PATCH /api/admin/users/:id with any of
//   { status: 'approved' | 'removed', role: 'creator' | 'viewer', can_comment: boolean }
// Nobody is made admin here, and the admin cannot demote or remove themselves.
const patch: ApiFunction = async ({ request, env, data, params }) => {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'not_found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error()
  } catch {
    return badRequest('invalid_body', 'Send a JSON object.')
  }

  const changes: UserChanges = {}
  if (body.status !== undefined) {
    if (body.status !== 'approved' && body.status !== 'removed') {
      return badRequest('invalid_status', "status must be 'approved' or 'removed'.")
    }
    changes.status = body.status
  }
  if (body.role !== undefined) {
    if (body.role !== 'creator' && body.role !== 'viewer') {
      return badRequest('invalid_role', "role must be 'creator' or 'viewer'.")
    }
    changes.role = body.role
  }
  if (body.can_comment !== undefined) {
    if (typeof body.can_comment !== 'boolean') return badRequest('invalid_can_comment', 'can_comment must be true or false.')
    changes.can_comment = body.can_comment ? 1 : 0
  }
  if (Object.keys(changes).length === 0) {
    return badRequest('no_changes', 'Send at least one of status, role or can_comment.')
  }

  // Any role sent here is below admin, and any status other than approved locks them out.
  if (id === data.user!.id && (changes.role !== undefined || changes.status === 'removed')) {
    return Response.json(
      { error: 'cannot_change_self', message: "You can't demote or remove yourself." },
      { status: 403 },
    )
  }

  if (!(await getUserById(env.DB, id))) return Response.json({ error: 'not_found' }, { status: 404 })
  const user = await updateUser(env.DB, id, changes)
  return Response.json({ user })
}

export const onRequestPatch = [requireRole('admin'), patch]
