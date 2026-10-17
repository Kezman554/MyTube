import { describe, expect, it } from 'vitest'
import { gate, OPEN_ROUTES } from '../functions/api/_middleware'
import type { User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { runChain } from './helpers'

// Every route in functions/api/ and the guard it must carry. A route added without a line here fails
// the first test, so each new route gets a decision. 'open' routes are the gate's OPEN_ROUTES only.
type Guard = 'open' | 'approved' | 'creator' | 'admin'
const EXPECTED: Record<string, Guard> = {
  'GET /api/health': 'open',
  'GET /api/me': 'open',
  'POST /api/register': 'open',

  'GET /api/videos': 'approved',
  'GET /api/videos/[id]': 'approved',
  'GET /api/videos/[id]/comments': 'approved',
  'POST /api/videos/[id]/comments': 'approved',
  'POST /api/videos/[id]/like': 'approved',
  'DELETE /api/videos/[id]/like': 'approved',
  'POST /api/videos/[id]/view': 'approved',
  'GET /api/playlists': 'approved',
  'GET /api/playlists/[id]': 'approved',
  'GET /api/stream/[id]': 'approved',
  'GET /api/thumbnails/[id]': 'approved',

  'POST /api/videos': 'creator',
  'PATCH /api/videos/[id]': 'creator',
  'POST /api/uploads/start': 'creator',
  'PUT /api/uploads/part': 'creator',
  'POST /api/uploads/complete': 'creator',
  'POST /api/uploads/abort': 'creator',

  'DELETE /api/videos/[id]': 'admin',
  'GET /api/admin/users': 'admin',
  'PATCH /api/admin/users/[id]': 'admin',
  'GET /api/admin/videos': 'admin',
  'POST /api/admin/videos/[id]/publish': 'admin',
  'POST /api/admin/videos/[id]/reject': 'admin',
  'GET /api/admin/comments': 'admin',
  'DELETE /api/admin/comments/[id]': 'admin',
  'GET /api/admin/orphans': 'admin',
  'DELETE /api/admin/orphans': 'admin',
  'GET /api/admin/playlists': 'admin',
  'POST /api/admin/playlists': 'admin',
  'PATCH /api/admin/playlists/[id]': 'admin',
  'DELETE /api/admin/playlists/[id]': 'admin',
  'PUT /api/admin/playlists/[id]/order': 'admin',
  'POST /api/admin/playlists/[id]/videos': 'admin',
  'DELETE /api/admin/playlists/[id]/videos/[videoId]': 'admin',
}

type Handler = (context: never) => Response | Promise<Response>

// Finds every onRequest<Method> export, keyed 'METHOD /api/path' with [params] as in the file names.
const modules = import.meta.glob<Record<string, unknown>>('../functions/api/**/*.ts', { eager: true })
const routes = new Map<string, Handler[]>()
for (const [file, mod] of Object.entries(modules)) {
  if (file.endsWith('/_middleware.ts')) continue
  const path = file.replace('../functions', '').replace(/\.ts$/, '').replace(/\/index$/, '')
  for (const [name, value] of Object.entries(mod)) {
    const method = /^onRequest(Get|Post|Put|Patch|Delete)$/.exec(name)?.[1]
    if (method) routes.set(`${method.toUpperCase()} ${path}`, (Array.isArray(value) ? value : [value]) as Handler[])
    else if (name.startsWith('onRequest')) throw new Error(`${file}: unexpected export ${name}`)
  }
}

// If a guard lets a request through, the route touches the database or bucket, and this says so.
const tripwire = new Proxy({} as Record<string, unknown>, {
  get(_, prop) {
    if (prop === 'then') return undefined
    throw new Error(`route reached its handler (touched .${String(prop)})`)
  },
})
const env = { DB: tripwire, MEDIA: tripwire, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' } as unknown as Env

function user(role: User['role'], status: User['status']): User {
  return { id: 7, email: `${role}-${status}@example.com`, username: `${role}${status}`, role, status, can_comment: 1, created_at: '2026-10-17T00:00:00Z' }
}
const PENDING = user('viewer', 'pending')
const REMOVED = user('creator', 'removed')
const VIEWER = user('viewer', 'approved')
const CREATOR = user('creator', 'approved')

// Who must be refused for each guard. Each of them, plus an unregistered caller, gets 403 before the handler.
const REFUSED: Record<Exclude<Guard, 'open'>, (User | null)[]> = {
  approved: [null, PENDING, REMOVED],
  creator: [null, PENDING, REMOVED, VIEWER],
  admin: [null, PENDING, REMOVED, VIEWER, CREATOR],
}

function request(key: string) {
  const [method, path] = key.split(' ')
  const url = 'https://mytube-672.pages.dev' + path.replace(/\[[a-zA-Z]+\]/g, '1')
  return new Request(url, { method })
}

const params = { id: '1', videoId: '1' }

describe('every route in functions/api', () => {
  it('is in the guard table, and the table has no stale entries', () => {
    expect([...routes.keys()].sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('opens exactly the gate\'s OPEN_ROUTES, with no guard of their own', () => {
    const open = Object.entries(EXPECTED).filter(([, g]) => g === 'open').map(([key]) => key.split(' ')[1])
    expect(open.sort()).toEqual([...OPEN_ROUTES].sort())
  })

  for (const [key, guard] of Object.entries(EXPECTED)) {
    if (guard === 'open') continue
    it(`${key} refuses everyone below ${guard} with its own guard, before the handler runs`, async () => {
      const handlers = routes.get(key)!
      expect(handlers.length).toBeGreaterThan(1)
      for (const who of REFUSED[guard]) {
        const res = await runChain(handlers, { env, data: { email: who?.email ?? 'stranger@example.com', user: who }, request: request(key), params })
        expect(res.status, `${key} as ${who ? `${who.role}/${who.status}` : 'unregistered'}`).toBe(403)
      }
    })

    it(`${key} is also refused to pending users by the /api gate`, async () => {
      const res = await runChain([gate, ...routes.get(key)!], { env, data: { email: PENDING.email, user: PENDING }, request: request(key), params })
      expect(res.status).toBe(403)
    })
  }
})
