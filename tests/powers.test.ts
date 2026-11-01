import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate, onRequest as middleware } from '../functions/api/_middleware'
import { onRequestDelete as deleteCommentRoute } from '../functions/api/admin/comments/[id]'
import { onRequestGet as recentCommentsRoute } from '../functions/api/admin/comments/index'
import { onRequestPost as createPlaylistRoute } from '../functions/api/admin/playlists/index'
import { onRequestPatch as patchUserRoute } from '../functions/api/admin/users/[id]'
import { onRequestPut as putPowersRoute } from '../functions/api/admin/users/[id]/powers'
import { onRequestGet as listUsersRoute } from '../functions/api/admin/users/index'
import { onRequestPost as reviewPublishRoute } from '../functions/api/admin/videos/[id]/publish'
import { onRequestPost as rejectRoute } from '../functions/api/admin/videos/[id]/reject'
import { onRequestGet as queueRoute } from '../functions/api/admin/videos/index'
import { onRequestGet as meRoute } from '../functions/api/me'
import { onRequestPost as startUploadRoute } from '../functions/api/uploads/start'
import { onRequestGet as getVideoRoute } from '../functions/api/videos/[id]'
import { onRequestPost as postCommentRoute } from '../functions/api/videos/[id]/comments'
import { onRequestPost as publishOwnRoute } from '../functions/api/videos/[id]/publish'
import { onRequestPost as createVideoRoute } from '../functions/api/videos/index'
import { createUpload, createUser, createVideo, getUserById, getVideo, markUploadComplete, run, type User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { POWERS, type Power } from '../functions/lib/powers'
import { newVideoKey } from '../functions/lib/storage'
import { applyMigrations, createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, kid: User, cousin: User, nan: User

beforeAll(async () => {
  const test = await createTestDb('powers-test', { r2: true })
  mf = test.mf
  env = { DB: test.db, MEDIA: test.bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  kid = (await createUser(env.DB, 'son@example.com', 'CrAzYeNdErMaN', 'viewer', 'approved'))!
  cousin = (await createUser(env.DB, 'cousin@example.com', 'Cousin', 'viewer', 'approved'))!
  nan = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev'
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

// Calls a route as a user the way a request arrives: the user row is read again, and powers are
// loaded for this request only (the guards read them from the database when the middleware hasn't).
async function call(handlers: unknown, as: User, method: string, path: string, params: Record<string, string> = {}, body?: unknown) {
  const user = (await getUserById(env.DB, as.id))!
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const init: RequestInit = { method }
  if (body instanceof Request) return res(await runChain(chain, { env, data: { email: user.email, user }, request: body, params }))
  if (body !== undefined) init.body = JSON.stringify(body)
  return res(await runChain(chain, { env, data: { email: user.email, user }, request: new Request(BASE + path, init), params }))
}

async function res(response: Response) {
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Json }
}

const grant = (who: User, powers: unknown) =>
  call(putPowersRoute, admin, 'PUT', `/api/admin/users/${who.id}/powers`, { id: String(who.id) }, { powers })

// Each test starts the kid with exactly these powers.
async function only(...powers: Power[]) {
  expect((await grant(kid, powers)).status).toBe(200)
}

let seq = 0
async function draft(owner: User, status: 'draft' | 'published' = 'draft') {
  seq++
  const v = (await createVideo(env.DB, { title: `P${seq}`, description: '', r2_key: `videos/p-${seq}.mp4`, thumbnail_key: null, status, uploaded_by: owner.id }))!
  if (status === 'published') await run(env.DB, "UPDATE videos SET published_at = '2026-10-01T00:00:00Z' WHERE id = ?", v.id)
  return v
}

async function comment(as: User, videoId: number, body: string, parentId?: number) {
  const r = await call(postCommentRoute, as, 'POST', `/api/videos/${videoId}/comments`, { id: String(videoId) }, { body, parent_id: parentId })
  expect(r.status).toBe(201)
  return r.json.comment as Json
}

describe('the migration', () => {
  it('gives every existing creator the upload power and leaves no creator role', async () => {
    const old = await createTestDb('powers-migration', { before: '0005' })
    try {
      const db = old.db
      for (const [email, name, role] of [['a@x.test', 'Dad', 'admin'], ['s@x.test', 'Son', 'creator'], ['c@x.test', 'Cuz', 'creator'], ['n@x.test', 'Nan', 'viewer']]) {
        await db.prepare("INSERT INTO users (email, username, role, status) VALUES (?, ?, ?, 'approved')").bind(email, name, role).run()
      }
      await applyMigrations(db, (file) => file.startsWith('0005'))

      const { results: users } = await db.prepare('SELECT username, role FROM users ORDER BY id').all()
      expect(users).toEqual([
        { username: 'Dad', role: 'admin' },
        { username: 'Son', role: 'viewer' },
        { username: 'Cuz', role: 'viewer' },
        { username: 'Nan', role: 'viewer' },
      ])
      const { results: powers } = await db
        .prepare('SELECT users.username, power FROM user_powers JOIN users ON users.id = user_id ORDER BY users.id')
        .all()
      expect(powers).toEqual([
        { username: 'Son', power: 'upload' },
        { username: 'Cuz', power: 'upload' },
      ])

      // From now on the role is admin or viewer, and powers are only the six.
      await expect(db.prepare("INSERT INTO users (email, username, role) VALUES ('z@x.test', 'Zed', 'creator')").run()).rejects.toThrow(/admin or viewer/)
      await expect(db.prepare("UPDATE users SET role = 'creator' WHERE username = 'Nan'").run()).rejects.toThrow(/admin or viewer/)
      await expect(db.prepare("INSERT INTO user_powers (user_id, power) VALUES (4, 'admin')").run()).rejects.toThrow(/CHECK/)
    } finally {
      await old.mf.dispose()
    }
  })
})

describe('granting and revoking', () => {
  it('lets the admin set the full list, replacing what was there', async () => {
    const r = await grant(kid, ['review_drafts', 'upload', 'upload'])
    expect(r.status).toBe(200)
    expect(r.json.user).toMatchObject({ id: kid.id, role: 'viewer', powers: ['upload', 'review_drafts'] })
    expect((await grant(kid, ['approve_users'])).json.user.powers).toEqual(['approve_users'])
    expect((await grant(kid, [])).json.user.powers).toEqual([])
  })

  it('refuses unknown powers and bad bodies with 400, unknown users with 404', async () => {
    for (const powers of [['admin'], ['upload', 'fly'], 'upload', null, undefined, [1]]) {
      expect((await grant(kid, powers)).status, JSON.stringify(powers)).toBe(400)
    }
    expect((await call(putPowersRoute, admin, 'PUT', '/x', { id: '99999' }, { powers: [] })).status).toBe(404)
  })

  it("is refused for the admin's own account, and to everyone but the admin", async () => {
    const own = await grant(admin, ['upload'])
    expect(own.status).toBe(403)
    expect(own.json.error).toBe('cannot_change_admin')
    await only(...POWERS)
    const r = await call(putPowersRoute, kid, 'PUT', '/x', { id: String(cousin.id) }, { powers: ['upload'] })
    expect(r.status).toBe(403)
    expect((await call(putPowersRoute, kid, 'PUT', '/x', { id: String(kid.id) }, { powers: [...POWERS] })).status).toBe(403)
  })

  it('never makes anyone admin: every power still leaves the role viewer', async () => {
    await only(...POWERS)
    expect((await getUserById(env.DB, kid.id))!.role).toBe('viewer')
  })

  it('reports powers from /api/me and the full list from GET /api/admin/users', async () => {
    await only('upload', 'moderate_comments')
    const me = await call(meRoute, kid, 'GET', '/api/me')
    expect(me.json.powers).toEqual(['upload', 'moderate_comments'])
    expect((await call(meRoute, admin, 'GET', '/api/me')).json.powers).toEqual([...POWERS])

    const { json } = await call(listUsersRoute, admin, 'GET', '/api/admin/users')
    const byName = Object.fromEntries(json.users.map((u: Json) => [u.username, u.powers]))
    expect(byName).toMatchObject({ Dad: [...POWERS], 'CrAzYeNdErMaN': ['upload', 'moderate_comments'], Nan: [] })
  })

  it('reads powers fresh on every request through the middleware, so a revoke bites on the next one', async () => {
    const asKid = { ...env, DEV_EMAIL: kid.email }
    const viaMiddleware = async () => {
      const request = new Request('http://localhost:8788/api/admin/playlists', { method: 'POST', body: JSON.stringify({ title: `Fresh ${++seq}` }) })
      return (await runChain([...middleware, ...createPlaylistRoute] as never, { env: asKid, data: {}, request })).status
    }
    const me = async () =>
      (await (await runChain([...middleware, meRoute] as never, { env: asKid, data: {}, request: new Request('http://localhost:8788/api/me') })).json()) as Json

    await only('manage_playlists')
    expect(await viaMiddleware()).toBe(201)
    expect((await me()).powers).toEqual(['manage_playlists'])
    await only()
    expect(await viaMiddleware()).toBe(403)
    expect((await me()).powers).toEqual([])
  })
})

describe('each power, on and off', () => {
  it('upload: starting an upload', async () => {
    const start = () => call(startUploadRoute, kid, 'POST', '/api/uploads/start', {}, { filename: 'clip.mp4', size: 1000 })
    await only()
    expect((await start()).status).toBe(403)
    await only('upload')
    expect((await start()).status).toBe(201)
  })

  it('publish_own: publishing your own draft, not anyone else\'s', async () => {
    const mine = await draft(kid)
    const theirs = await draft(cousin)
    const publish = (id: number) => call(publishOwnRoute, kid, 'POST', `/api/videos/${id}/publish`, { id: String(id) })
    await only('upload')
    expect((await publish(mine.id)).status).toBe(403)
    expect((await getVideo(env.DB, mine.id))!.status).toBe('draft')

    await only('upload', 'publish_own')
    const r = await publish(mine.id)
    expect(r.status).toBe(200)
    expect(r.json.video).toMatchObject({ id: mine.id, status: 'published' })
    expect((await publish(mine.id)).status).toBe(200)
    expect((await publish(theirs.id)).status).toBe(404) // can't even see it
    await only('publish_own', 'review_drafts')
    expect((await publish(theirs.id)).json.error).toBe('not_yours')
  })

  it('publish_own: publishing straight away from the upload form', async () => {
    const create = async () => {
      const key = newVideoKey('clip.mp4')
      const uploadId = crypto.randomUUID()
      await createUpload(env.DB, { upload_id: uploadId, r2_key: key, user_id: kid.id, filename: 'clip.mp4', content_type: 'video/mp4', size: 64 })
      await markUploadComplete(env.DB, uploadId)
      const form = new FormData()
      form.set('key', key)
      form.set('title', 'Straight out')
      form.set('publish', 'true')
      const encoded = new Response(form)
      const body = await encoded.arrayBuffer()
      const request = new Request(`${BASE}/api/videos`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': encoded.headers.get('Content-Type')!, 'Content-Length': String(body.byteLength) },
      })
      return call(createVideoRoute, kid, 'POST', '/api/videos', {}, request)
    }
    await only('upload')
    expect((await create()).json.video.status).toBe('draft')
    await only('upload', 'publish_own')
    expect((await create()).json.video.status).toBe('published')
  })

  it('manage_playlists: creating a playlist', async () => {
    const create = () => call(createPlaylistRoute, kid, 'POST', '/api/admin/playlists', {}, { title: `List ${++seq}` })
    await only(...POWERS.filter((p) => p !== 'manage_playlists'))
    expect((await create()).status).toBe(403)
    await only('manage_playlists')
    expect((await create()).status).toBe(201)
  })

  it('moderate_comments: listing, deleting, muting and unmuting', async () => {
    const v = await draft(cousin, 'published')
    const c = await comment(nan, v.id, 'Hello')
    const del = () => call(deleteCommentRoute, kid, 'DELETE', `/api/admin/comments/${c.id}`, { id: String(c.id) })
    const mute = (on: boolean) => call(patchUserRoute, kid, 'PATCH', `/api/admin/users/${nan.id}`, { id: String(nan.id) }, { can_comment: !on })

    await only('approve_users')
    expect((await call(recentCommentsRoute, kid, 'GET', '/api/admin/comments')).status).toBe(403)
    expect((await del()).status).toBe(403)
    expect((await mute(true)).status).toBe(403)
    expect((await getUserById(env.DB, nan.id))!.can_comment).toBe(1)

    await only('moderate_comments')
    expect((await call(recentCommentsRoute, kid, 'GET', '/api/admin/comments')).status).toBe(200)
    expect((await mute(true)).json.user).toMatchObject({ id: nan.id, can_comment: 0 })
    expect((await mute(false)).json.user).toMatchObject({ id: nan.id, can_comment: 1 })
    expect((await del()).status).toBe(200)
    expect((await del()).status).toBe(404)
  })

  it('review_drafts: the queue, seeing, publishing and rejecting anyone\'s draft', async () => {
    const a = await draft(cousin)
    const b = await draft(cousin)
    const queue = () => call(queueRoute, kid, 'GET', '/api/admin/videos')
    const see = () => call(getVideoRoute, kid, 'GET', `/api/videos/${a.id}`, { id: String(a.id) })
    const publish = () => call(reviewPublishRoute, kid, 'POST', `/api/admin/videos/${a.id}/publish`, { id: String(a.id) })
    const reject = () => call(rejectRoute, { ...kid } as User, 'POST', `/api/admin/videos/${b.id}/reject`, { id: String(b.id) })

    await only('upload', 'publish_own')
    expect((await queue()).status).toBe(403)
    expect((await see()).status).toBe(404)
    expect((await publish()).status).toBe(403)
    expect((await reject()).status).toBe(403)

    await only('review_drafts')
    expect((await queue()).json.videos.map((v: Json) => v.id)).toEqual(expect.arrayContaining([a.id, b.id]))
    expect((await see()).status).toBe(200)
    expect((await publish()).json.video.status).toBe('published')
    expect((await reject()).status).toBe(200)
    expect(await getVideo(env.DB, b.id)).toBeNull()
  })

  it('approve_users: listing, approving and removing', async () => {
    const newcomer = (await createUser(env.DB, `new${++seq}@example.com`, `New${seq}`, 'viewer', 'pending'))!
    const set = (status: string) => call(patchUserRoute, kid, 'PATCH', `/api/admin/users/${newcomer.id}`, { id: String(newcomer.id) }, { status })

    await only('moderate_comments')
    expect((await call(listUsersRoute, kid, 'GET', '/api/admin/users')).status).toBe(403)
    expect((await set('approved')).status).toBe(403)
    expect((await getUserById(env.DB, newcomer.id))!.status).toBe('pending')

    await only('approve_users')
    expect((await call(listUsersRoute, kid, 'GET', '/api/admin/users')).status).toBe(200)
    expect((await set('approved')).json.user.status).toBe('approved')
    expect((await set('removed')).json.user.status).toBe('removed')
    // Nobody removes themselves.
    expect((await call(patchUserRoute, kid, 'PATCH', '/x', { id: String(kid.id) }, { status: 'removed' })).json.error).toBe('cannot_change_self')
  })
})

describe('nothing done under a power acts on the admin', () => {
  it('cannot remove or mute the admin', async () => {
    await only(...POWERS)
    for (const body of [{ status: 'removed' }, { can_comment: false }, { status: 'approved' }]) {
      const r = await call(patchUserRoute, kid, 'PATCH', '/x', { id: String(admin.id) }, body)
      expect(r.status, JSON.stringify(body)).toBe(403)
      expect(r.json.error).toBe('cannot_act_on_admin')
    }
    expect(await getUserById(env.DB, admin.id)).toMatchObject({ status: 'approved', can_comment: 1 })
  })

  it("cannot delete the admin's comment, or a thread holding an admin reply", async () => {
    await only(...POWERS)
    const v = await draft(cousin, 'published')
    const dads = await comment(admin, v.id, 'Proud of you')
    const top = await comment(nan, v.id, 'Lovely')
    await comment(admin, v.id, 'Thanks Nan', top.id)
    const lone = await comment(nan, v.id, 'Another')

    for (const id of [dads.id, top.id]) {
      const r = await call(deleteCommentRoute, kid, 'DELETE', '/x', { id: String(id) })
      expect(r.status).toBe(403)
      expect(r.json.error).toBe('cannot_act_on_admin')
    }
    expect((await call(deleteCommentRoute, kid, 'DELETE', '/x', { id: String(lone.id) })).status).toBe(200)
    // The admin still can.
    expect((await call(deleteCommentRoute, admin, 'DELETE', '/x', { id: String(top.id) })).status).toBe(200)
  })

  it("cannot reject, publish or even see the admin's drafts", async () => {
    await only(...POWERS)
    const dads = await draft(admin)
    const id = String(dads.id)
    for (const route of [rejectRoute, reviewPublishRoute]) {
      const r = await call(route, kid, 'POST', '/x', { id })
      expect(r.status).toBe(403)
      expect(r.json.error).toBe('cannot_act_on_admin')
    }
    expect((await getVideo(env.DB, dads.id))!.status).toBe('draft')
    expect((await call(queueRoute, kid, 'GET', '/api/admin/videos')).json.videos.map((v: Json) => v.id)).not.toContain(dads.id)
    expect((await call(getVideoRoute, kid, 'GET', '/x', { id })).status).toBe(404)
    // The admin sees and rejects their own.
    expect((await call(queueRoute, admin, 'GET', '/api/admin/videos')).json.videos.map((v: Json) => v.id)).toContain(dads.id)
    expect((await call(rejectRoute, admin, 'POST', '/x', { id })).status).toBe(200)
  })
})
