import { getChannelOwnerId, listUsers, type UserStatus } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { powersOf, requirePower } from '../../../lib/guards'
import { loadAllPowers, userJsonFor } from '../../../lib/powers'

const STATUSES: readonly UserStatus[] = ['pending', 'approved', 'removed']

// GET /api/admin/users[?status=pending|approved|removed] (approve_users), oldest first. For the admin, each
// user also carries email, powers (what is ticked; every power for the admin's own row) and admin_access.
// Helpers get email for pending users only, and status_admin_only (see userJsonFor).
const list: ApiFunction = async (context) => {
  const { request, env, data } = context
  const status = new URL(request.url).searchParams.get('status')
  if (status !== null && !STATUSES.includes(status as UserStatus)) {
    return Response.json({ error: 'invalid_status' }, { status: 400 })
  }
  const [users, powers, ownerId] = await Promise.all([
    listUsers(env.DB, (status as UserStatus | null) ?? undefined),
    loadAllPowers(env.DB),
    getChannelOwnerId(env.DB),
  ])
  const viewer = { user: data.user!, powers: await powersOf(context) }
  return Response.json({ users: users.map((u) => userJsonFor(viewer, u, powers.get(u.id) ?? [], ownerId)) })
}

export const onRequestGet = [requirePower('approve_users'), list]
