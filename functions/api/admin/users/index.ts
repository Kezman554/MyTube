import { listUsers, type UserStatus } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requirePower } from '../../../lib/guards'
import { loadAllPowers, userWithPowers } from '../../../lib/powers'

const STATUSES: readonly UserStatus[] = ['pending', 'approved', 'removed']

// GET /api/admin/users[?status=pending|approved|removed] (approve_users), oldest first. Each user carries
// powers: their full list (every power for the admin).
const list: ApiFunction = async ({ request, env }) => {
  const status = new URL(request.url).searchParams.get('status')
  if (status !== null && !STATUSES.includes(status as UserStatus)) {
    return Response.json({ error: 'invalid_status' }, { status: 400 })
  }
  const [users, powers] = await Promise.all([listUsers(env.DB, (status as UserStatus | null) ?? undefined), loadAllPowers(env.DB)])
  return Response.json({ users: users.map((u) => userWithPowers(u, powers.get(u.id) ?? [])) })
}

export const onRequestGet = [requirePower('approve_users'), list]
