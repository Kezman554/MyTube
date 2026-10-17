import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestPatch as patchUser } from '../functions/api/admin/users/[id]'
import { onRequestGet as listUsers } from '../functions/api/admin/users/index'
import { createUser, getUserById, type User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { createTestDb, ROUTE_REACHED, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, viewer: User, pending: User, removed: User

beforeAll(async () => {
  const test = await createTestDb('admin-test')
  mf = test.mf
  env = { DB: test.db, MEDIA: {} as R2Bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  viewer = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  pending = (await createUser(env.DB, 'cousin@example.com', 'Cousin', 'viewer', 'pending'))!
  removed = (await createUser(env.DB, 'gone@example.com', 'Gone', 'viewer', 'removed'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev'

function get(as: User | null, path: string) {
  return runChain([gate, ...listUsers], {
    env,
    data: { email: as?.email ?? 'stranger@example.com', user: as },
    request: new Request(BASE + path),
  })
}

function patch(as: User, id: number | string, body: unknown) {
  return runChain([gate, ...patchUser], {
    env,
    data: { email: as.email, user: as },
    request: new Request(`${BASE}/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    params: { id: String(id) },
  })
}

describe('GET /api/admin/users', () => {
  it('lists every user for the admin', async () => {
    const res = await get(admin, '/api/admin/users')
    expect(res.status).toBe(200)
    const { users } = (await res.json()) as { users: User[] }
    expect(users.map((u) => u.username)).toEqual(['Dad', 'Nan', 'Cousin', 'Gone'])
  })

  it('filters by status', async () => {
    const { users } = (await (await get(admin, '/api/admin/users?status=pending')).json()) as { users: User[] }
    expect(users.map((u) => u.username)).toEqual(['Cousin'])
  })

  it('rejects an unknown status filter with 400', async () => {
    expect((await get(admin, '/api/admin/users?status=banned')).status).toBe(400)
  })

  it('gives an approved viewer 403', async () => {
    const res = await get(viewer, '/api/admin/users')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it('gives pending, removed and unregistered callers 403', async () => {
    for (const who of [pending, removed, null]) expect((await get(who, '/api/admin/users')).status).toBe(403)
  })
})

describe('PATCH /api/admin/users/:id', () => {
  it('lets the admin approve a pending user', async () => {
    const res = await patch(admin, pending.id, { status: 'approved' })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { user: User }).user).toMatchObject({ id: pending.id, status: 'approved' })
    expect((await getUserById(env.DB, pending.id))!.status).toBe('approved')
  })

  it('lets the admin mute and unmute a user', async () => {
    await patch(admin, viewer.id, { can_comment: false })
    expect((await getUserById(env.DB, viewer.id))!.can_comment).toBe(0)
    await patch(admin, viewer.id, { can_comment: true })
    expect((await getUserById(env.DB, viewer.id))!.can_comment).toBe(1)
  })

  it('lets the admin change roles', async () => {
    await patch(admin, viewer.id, { role: 'creator' })
    expect((await getUserById(env.DB, viewer.id))!.role).toBe('creator')
    await patch(admin, viewer.id, { role: 'viewer' })
    expect((await getUserById(env.DB, viewer.id))!.role).toBe('viewer')
  })

  it('sets several fields at once', async () => {
    const res = await patch(admin, removed.id, { status: 'approved', role: 'creator', can_comment: false })
    expect(((await res.json()) as { user: User }).user).toMatchObject({ status: 'approved', role: 'creator', can_comment: 0 })
    await patch(admin, removed.id, { status: 'removed', role: 'viewer', can_comment: true })
  })

  it('never makes anyone admin, or pending', async () => {
    expect((await patch(admin, viewer.id, { role: 'admin' })).status).toBe(400)
    expect((await patch(admin, viewer.id, { status: 'pending' })).status).toBe(400)
    expect((await getUserById(env.DB, viewer.id))!.role).toBe('viewer')
  })

  it('rejects bad bodies with 400', async () => {
    for (const body of [{}, { can_comment: 'no' }, [], null, 'text']) {
      expect((await patch(admin, viewer.id, body)).status).toBe(400)
    }
  })

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await patch(admin, 9999, { status: 'approved' })).status).toBe(404)
    expect((await patch(admin, 'abc', { status: 'approved' })).status).toBe(404)
  })

  it('stops the admin demoting or removing themselves', async () => {
    for (const body of [{ role: 'viewer' }, { role: 'creator' }, { status: 'removed' }]) {
      const res = await patch(admin, admin.id, body)
      expect(res.status).toBe(403)
      expect(((await res.json()) as { error: string }).error).toBe('cannot_change_self')
    }
    expect(await getUserById(env.DB, admin.id)).toMatchObject({ role: 'admin', status: 'approved' })
  })

  it('gives a viewer 403 and changes nothing', async () => {
    const res = await patch(viewer, removed.id, { status: 'approved' })
    expect(res.status).toBe(403)
    expect((await getUserById(env.DB, removed.id))!.status).toBe('removed')
  })
})

describe('approval gate on content routes', () => {
  // Stand-ins for routes that don't exist yet: the gate covers any /api path not on its open list.
  const CONTENT = ['/api/videos', '/api/videos/1', '/api/videos/1/stream', '/api/playlists', '/api/comments']

  function reach(as: User | null, path: string) {
    return runChain(gate, {
      env,
      data: { email: as?.email ?? 'stranger@example.com', user: as },
      request: new Request(BASE + path),
    })
  }

  it('gives pending, removed and unregistered users 403', async () => {
    const stillPending = (await createUser(env.DB, 'later@example.com', 'Later'))!
    for (const [who, error] of [
      [stillPending, 'pending'],
      [removed, 'removed'],
      [null, 'not_registered'],
    ] as const) {
      for (const path of CONTENT) {
        const res = await reach(who, path)
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error })
      }
    }
  })

  it('lets approved users through', async () => {
    for (const path of CONTENT) expect(await (await reach(viewer, path)).text()).toBe(ROUTE_REACHED)
  })

  it('keeps /api/me, /api/register and /api/health open to everyone', async () => {
    for (const path of ['/api/me', '/api/register', '/api/health', '/api/me/']) {
      expect(await (await reach(null, path)).text()).toBe(ROUTE_REACHED)
    }
  })
})
