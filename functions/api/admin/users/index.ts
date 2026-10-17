import { listUsers, type UserStatus } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'

const STATUSES: readonly UserStatus[] = ['pending', 'approved', 'removed']

// GET /api/admin/users[?status=pending|approved|removed], oldest first.
const list: ApiFunction = async ({ request, env }) => {
  const status = new URL(request.url).searchParams.get('status')
  if (status !== null && !STATUSES.includes(status as UserStatus)) {
    return Response.json({ error: 'invalid_status' }, { status: 400 })
  }
  const users = await listUsers(env.DB, (status as UserStatus | null) ?? undefined)
  return Response.json({ users })
}

export const onRequestGet = [requireRole('admin'), list]
