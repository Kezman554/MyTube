import { describe, expect, it } from 'vitest'
import { gate, OPEN_ROUTES } from '../functions/api/_middleware'
import type { User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { POWERS, type Power } from '../functions/lib/powers'
import { ROUTE_REACHED, runChain } from './helpers'

// Every route in functions/api/ and what it needs. A route added without a line here fails the first
// test, so each new route gets a decision.
//   'open'      the gate's OPEN_ROUTES only: no approval needed
//   'approved'  any approved user
//   a power     an approved user holding it (the admin holds every power)
//   [powers]    an approved user holding any one of them; the handler then checks each field's power
//   'admin'     the admin only: no power covers it
type Need = 'open' | 'approved' | 'admin' | Power | Power[]
const EXPECTED: Record<string, Need> = {
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

  'POST /api/videos': 'upload',
  'PATCH /api/videos/[id]': 'upload',
  'POST /api/uploads/start': 'upload',
  'PUT /api/uploads/part': 'upload',
  'POST /api/uploads/complete': 'upload',
  'POST /api/uploads/abort': 'upload',

  'POST /api/videos/[id]/publish': 'publish_own',

  'GET /api/admin/playlists': 'manage_playlists',
  'POST /api/admin/playlists': 'manage_playlists',
  'PATCH /api/admin/playlists/[id]': 'manage_playlists',
  'DELETE /api/admin/playlists/[id]': 'manage_playlists',
  'PUT /api/admin/playlists/[id]/order': 'manage_playlists',
  'POST /api/admin/playlists/[id]/videos': 'manage_playlists',
  'DELETE /api/admin/playlists/[id]/videos/[videoId]': 'manage_playlists',

  'GET /api/admin/comments': 'moderate_comments',
  'DELETE /api/admin/comments/[id]': 'moderate_comments',

  'GET /api/admin/videos': 'review_drafts',
  'POST /api/admin/videos/[id]/publish': 'review_drafts',
  'POST /api/admin/videos/[id]/reject': 'review_drafts',

  'GET /api/admin/users': 'approve_users',
  // status needs approve_users, can_comment (mute) needs moderate_comments: checked per field.
  'PATCH /api/admin/users/[id]': ['approve_users', 'moderate_comments'],

  'DELETE /api/videos/[id]': 'admin',
  'PUT /api/admin/users/[id]/powers': 'admin',
  'GET /api/admin/orphans': 'admin',
  'DELETE /api/admin/orphans': 'admin',
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
// Powers come in data.powers, as the middleware sets them, so a guard never needs the database.
const tripwire = new Proxy({} as Record<string, unknown>, {
  get(_, prop) {
    if (prop === 'then') return undefined
    throw new Error(`route reached its handler (touched .${String(prop)})`)
  },
})
const env = { DB: tripwire, MEDIA: tripwire, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' } as unknown as Env

interface Caller {
  label: string
  user: User | null
  powers: Power[]
}

function caller(label: string, role: User['role'], status: User['status'], powers: readonly Power[] = []): Caller {
  const user: User = { id: 7, email: `${label}@example.com`, username: label, role, status, can_comment: 1, created_at: '2026-10-17T00:00:00Z' }
  return { label, user, powers: [...powers] }
}
const STRANGER: Caller = { label: 'unregistered', user: null, powers: [] }
// Pending and removed callers holding every power are still refused: powers act only once approved.
const PENDING = caller('pending', 'viewer', 'pending', POWERS)
const REMOVED = caller('removed', 'viewer', 'removed', POWERS)
const VIEWER = caller('viewer', 'viewer', 'approved')
const EVERY_POWER = caller('every-power', 'viewer', 'approved', POWERS)
const ADMIN = caller('admin', 'admin', 'approved', POWERS)

const needed = (need: Need): Power[] => (Array.isArray(need) ? need : [need as Power])
const isPowerNeed = (need: Need) => Array.isArray(need) || (POWERS as readonly string[]).includes(need)

// Who must be refused, and who must get through, for each need.
function refused(need: Need): Caller[] {
  const unapproved = [STRANGER, PENDING, REMOVED]
  if (need === 'approved') return unapproved
  if (need === 'admin') return [...unapproved, VIEWER, EVERY_POWER]
  // Every other power, but not the one (or ones) the route needs.
  const others = POWERS.filter((p) => !needed(need).includes(p))
  return [...unapproved, VIEWER, caller(`all-but-${needed(need).join('-')}`, 'viewer', 'approved', others)]
}

function admitted(need: Need): Caller[] {
  if (need === 'approved') return [VIEWER, ADMIN]
  if (need === 'admin') return [ADMIN]
  return [...needed(need).map((p) => caller(`only-${p}`, 'viewer', 'approved', [p])), ADMIN]
}

function request(key: string) {
  const [method, path] = key.split(' ')
  const url = 'https://mytube-672.pages.dev' + path.replace(/\[[a-zA-Z]+\]/g, '1')
  return new Request(url, { method })
}

const params = { id: '1', videoId: '1' }
const run = (handlers: Handler[], who: Caller, key: string) =>
  runChain(handlers, { env, data: { email: who.user?.email ?? 'stranger@example.com', user: who.user, powers: who.powers }, request: request(key), params })

describe('every route in functions/api', () => {
  it('is in the table, and the table has no stale entries', () => {
    expect([...routes.keys()].sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it("opens exactly the gate's OPEN_ROUTES, with no guard of their own", () => {
    const open = Object.entries(EXPECTED).filter(([, g]) => g === 'open').map(([key]) => key.split(' ')[1])
    expect(open.sort()).toEqual([...OPEN_ROUTES].sort())
  })

  it('gives every power at least one route', () => {
    const named = new Set(Object.values(EXPECTED).filter(isPowerNeed).flatMap(needed))
    expect([...named].sort()).toEqual([...POWERS].sort())
  })

  for (const [key, need] of Object.entries(EXPECTED)) {
    if (need === 'open') continue
    const label = Array.isArray(need) ? need.join(' or ') : need

    it(`${key} refuses everyone without ${label} with its own guard, before the handler runs`, async () => {
      const handlers = routes.get(key)!
      expect(handlers.length).toBeGreaterThan(1)
      for (const who of refused(need)) {
        const res = await run(handlers, who, key)
        expect(res.status, `${key} as ${who.label}`).toBe(403)
      }
    })

    // The guards alone (the route's handler stood in for by ROUTE_REACHED) let these callers through.
    it(`${key} admits ${label}${need === 'admin' ? '' : ' and the admin'}`, async () => {
      const guards = routes.get(key)!.slice(0, -1)
      for (const who of admitted(need)) {
        const res = await run(guards, who, key)
        expect(await res.text(), `${key} as ${who.label}`).toBe(ROUTE_REACHED)
      }
    })

    it(`${key} is also refused to pending users by the /api gate`, async () => {
      const res = await run([gate, ...routes.get(key)!], PENDING, key)
      expect(res.status).toBe(403)
    })
  }
})
