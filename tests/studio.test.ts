import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestPut as putOwnerRoute } from '../functions/api/admin/channel/owner'
import { onRequestGet as studioRoute } from '../functions/api/studio/index'
import { onRequestPost as seenRoute } from '../functions/api/studio/seen'
import { createUser, createVideo, getUserById, run, type User, type VideoStatus } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { POWERS, setPowers } from '../functions/lib/powers'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, kid: User, nan: User, jo: User, helper: User

beforeAll(async () => {
  const test = await createTestDb('studio-test')
  mf = test.mf
  env = { DB: test.db, MEDIA: {} as R2Bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  kid = (await createUser(env.DB, 'son@example.com', 'Oli', 'viewer', 'approved'))!
  nan = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  jo = (await createUser(env.DB, 'jo@example.com', 'Jo', 'viewer', 'approved'))!
  helper = (await createUser(env.DB, 'helper@example.com', 'Helper', 'viewer', 'approved'))!
  await setPowers(env.DB, helper.id, [...POWERS])
  await call(putOwnerRoute, admin, 'PUT', { user_id: kid.id })
})

afterAll(async () => {
  await mf.dispose()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(handlers: unknown, as: User, method: string, body?: unknown) {
  const user = (await getUserById(env.DB, as.id))!
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const request = new Request('https://mytube.pages.dev/api/studio', { method, body: body === undefined ? undefined : JSON.stringify(body) })
  const res = await runChain(chain, { env, data: { email: user.email, user }, request })
  return { status: res.status, json: (await res.json()) as Json }
}
const getStudio = (as: User = kid) => call(studioRoute, as, 'GET')
const markSeen = (seenAt: unknown, as: User = kid) => call(seenRoute, as, 'POST', { seen_at: seenAt })
// A visit as the page makes it: read, then mark seen as of that read.
async function visit(as: User = kid) {
  const r = await getStudio(as)
  await markSeen(r.json.as_of, as)
  return r.json
}

let seq = 0
async function video(owner: User, status: VideoStatus = 'published', publishedAt = '2026-09-01T00:00:00Z') {
  seq++
  const v = (await createVideo(env.DB, { title: `S${seq}`, description: '', r2_key: `videos/s-${seq}.mp4`, thumbnail_key: null, status, uploaded_by: owner.id }))!
  if (status === 'published') await run(env.DB, 'UPDATE videos SET published_at = ? WHERE id = ?', publishedAt, v.id)
  return v
}
// Activity stamped at a given time, so "new" doesn't depend on which second the test runs in.
const view = (videoId: number, who: User, at: string) =>
  run(env.DB, 'INSERT INTO views (video_id, user_id, created_at) VALUES (?, ?, ?)', videoId, who.id, at)
const like = (videoId: number, who: User, at: string) =>
  run(env.DB, 'INSERT INTO likes (video_id, user_id, created_at) VALUES (?, ?, ?)', videoId, who.id, at)
const comment = (videoId: number, who: User, at: string, body = 'Nice') =>
  run(env.DB, 'INSERT INTO comments (video_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', videoId, who.id, body, at)
const byId = (json: Json, id: number) => json.videos.find((v: Json) => v.id === id)

const OLD = '2026-09-10T00:00:00Z'

describe('who can open the Studio', () => {
  it('is the owner and the admin only, whatever powers anyone else holds', async () => {
    expect((await getStudio(kid)).status).toBe(200)
    expect((await getStudio(admin)).status).toBe(200)
    for (const who of [nan, helper]) {
      expect((await getStudio(who)).status, who.username).toBe(403)
      expect((await markSeen('2026-10-01T00:00:00Z', who)).status, who.username).toBe(403)
    }
  })

  it('follows the owner when the admin moves the channel', async () => {
    await call(putOwnerRoute, admin, 'PUT', { user_id: nan.id })
    expect((await getStudio(nan)).status).toBe(200)
    expect((await getStudio(kid)).status).toBe(403)
    await call(putOwnerRoute, admin, 'PUT', { user_id: kid.id })
    expect((await getStudio(kid)).status).toBe(200)
  })
})

describe('since the last visit', () => {
  it('counts everything as new on a first visit, then nothing on the visit straight after', async () => {
    const a = await video(admin)
    await view(a.id, nan, OLD)
    await like(a.id, nan, OLD)
    await comment(a.id, nan, OLD)

    const first = await getStudio()
    expect(first.json.since).toBeNull()
    expect(first.json.as_of).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
    expect(byId(first.json, a.id)).toMatchObject({ views: { total: 1, new: 1 }, likes: { total: 1, new: 1 }, comments: { total: 1, new: 1 } })
    await markSeen(first.json.as_of)

    // A reload or second visit straight after: the totals stay, nothing is new.
    const second = await visit()
    expect(second.since).toBe(first.json.as_of)
    expect(second.totals).toMatchObject({ views: { new: 0 }, likes: { new: 0 }, comments: { new: 0 }, videos: { new: 0 } })
    expect(second.videos.every((v: Json) => v.views.new === 0 && v.likes.new === 0 && v.comments.new === 0)).toBe(true)
    expect(second.comments.every((c: Json) => !c.new)).toBe(true)
    const third = await getStudio()
    expect(third.json.totals.views.new + third.json.totals.likes.new + third.json.totals.comments.new).toBe(0)
  })

  it("shows what arrived since, per video and in the channel's totals", async () => {
    // A fixed last visit, with activity before and after it.
    await run(env.DB, 'DELETE FROM studio_visits WHERE user_id = ?', kid.id)
    await markSeen('2026-10-15T00:00:00Z')
    const a = await video(admin)
    const b = await video(kid)
    for (const [who, at] of [[nan, '2026-10-14T00:00:00Z'], [jo, '2026-10-16T00:00:00Z'], [kid, '2026-10-17T00:00:00Z']] as const) {
      await view(a.id, who, at)
    }
    await like(a.id, nan, '2026-10-14T00:00:00Z')
    await like(b.id, jo, '2026-10-16T00:00:00Z')
    await comment(b.id, nan, '2026-10-14T00:00:00Z', 'Before')
    await comment(b.id, jo, '2026-10-16T00:00:00Z', 'After 1')
    await comment(b.id, nan, '2026-10-16T12:00:00Z', 'After 2')

    const before = (await getStudio()).json
    expect(before.since).toBe('2026-10-15T00:00:00Z')
    // Of the two views after the visit, the kid's own isn't news to them.
    expect(byId(before, a.id)).toMatchObject({ views: { total: 3, new: 1 }, likes: { total: 1, new: 0 }, comments: { total: 0, new: 0 } })
    expect(byId(before, b.id)).toMatchObject({ views: { total: 0, new: 0 }, likes: { total: 1, new: 1 }, comments: { total: 3, new: 2 } })
    const totals = before.totals
    expect(totals.views.new).toBe(1)
    expect(totals.likes.new).toBe(1)
    expect(totals.comments.new).toBe(2)
    // Totals are sums over every listed video.
    expect(totals.views.total).toBe(before.videos.reduce((n: number, v: Json) => n + v.views.total, 0))
    expect(totals.comments.total).toBe(before.videos.reduce((n: number, v: Json) => n + v.comments.total, 0))
    const flagged = before.comments.filter((c: Json) => c.video.id === b.id).map((c: Json) => [c.body, c.new])
    expect(flagged).toEqual([['After 2', true], ['After 1', true], ['Before', false]])

    // Two visits in a row: the second shows nothing new.
    await markSeen(before.as_of)
    const after = (await getStudio()).json
    expect([after.totals.views.new, after.totals.likes.new, after.totals.comments.new]).toEqual([0, 0, 0])
    expect(after.comments.some((c: Json) => c.new)).toBe(false)
  })

  it('keeps each person\'s visits apart: the admin looking doesn\'t clear the owner\'s news', async () => {
    await run(env.DB, 'DELETE FROM studio_visits')
    await markSeen('2026-10-15T00:00:00Z', kid)
    const a = await video(admin)
    await view(a.id, nan, '2026-10-20T00:00:00Z')
    await visit(admin)
    expect(byId((await getStudio(kid)).json, a.id).views.new).toBe(1)
  })

  it('never moves a visit backwards or into the future, and refuses a malformed time', async () => {
    await run(env.DB, 'DELETE FROM studio_visits WHERE user_id = ?', kid.id)
    expect((await markSeen('2026-10-20T00:00:00Z')).json.seen_at).toBe('2026-10-20T00:00:00Z')
    expect((await markSeen('2026-10-01T00:00:00Z')).json.seen_at).toBe('2026-10-20T00:00:00Z')
    const future = (await markSeen('2999-01-01T00:00:00Z')).json.seen_at
    expect(future < '2999').toBe(true)
    for (const bad of ['yesterday', '2026-10-20', 1730000000, null]) expect((await markSeen(bad)).status, String(bad)).toBe(400)
  })

  it('counts a video published since the last visit as a new video', async () => {
    await run(env.DB, 'DELETE FROM studio_visits WHERE user_id = ?', kid.id)
    await markSeen('2026-10-15T00:00:00Z')
    const before = (await getStudio()).json.totals.videos
    await video(admin, 'published', '2026-10-25T00:00:00Z')
    const after = (await getStudio()).json.totals.videos
    expect(after).toEqual({ total: before.total + 1, new: before.new + 1 })
  })
})

describe('your own activity', () => {
  it("counts in the totals but isn't news to you", async () => {
    await run(env.DB, 'DELETE FROM studio_visits WHERE user_id = ?', kid.id)
    await markSeen('2026-10-15T00:00:00Z')
    const a = await video(admin)
    await view(a.id, kid, '2026-10-20T00:00:00Z')
    await like(a.id, kid, '2026-10-20T00:00:00Z')
    await comment(a.id, kid, '2026-10-20T00:00:00Z', 'My own')
    await view(a.id, nan, '2026-10-20T00:00:00Z')
    const mine = (await getStudio()).json
    expect(byId(mine, a.id)).toMatchObject({ views: { total: 2, new: 1 }, likes: { total: 1, new: 0 }, comments: { total: 1, new: 0 } })
    expect(mine.comments.find((c: Json) => c.body === 'My own').new).toBe(false)
    // The admin, looking at the same channel, sees the kid's activity as new.
    await run(env.DB, 'DELETE FROM studio_visits WHERE user_id = ?', admin.id)
    await markSeen('2026-10-15T00:00:00Z', admin)
    expect(byId((await getStudio(admin)).json, a.id)).toMatchObject({ views: { new: 2 }, likes: { new: 1 }, comments: { new: 1 } })
  })
})

describe('what the Studio lists', () => {
  it("shows every published video and the owner's drafts, not anyone else's drafts", async () => {
    const mine = await video(kid, 'draft')
    const theirs = await video(jo, 'draft')
    const dads = await video(admin, 'draft')
    const ids = (await getStudio()).json.videos.map((v: Json) => v.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
    expect(ids).not.toContain(dads.id)
    expect(byId((await getStudio()).json, mine.id)).toMatchObject({ status: 'draft', published_at: null })
    // The admin sees the owner's drafts in the owner's Studio too.
    expect((await getStudio(admin)).json.videos.map((v: Json) => v.id)).toContain(mine.id)
  })

  it('lists the 50 newest comments, newest first, with who, which video and a link', async () => {
    const v = await video(admin)
    for (let i = 0; i < 55; i++) await comment(v.id, nan, `2026-10-2${Math.floor(i / 10)}T00:00:${String(i % 60).padStart(2, '0')}Z`, `C${i}`)
    const { comments } = (await getStudio()).json
    expect(comments).toHaveLength(50)
    expect(comments[0]).toMatchObject({ body: 'C54', user: { username: 'Nan' }, video: { id: v.id, title: v.title }, link: `/watch/${v.id}#comment-${comments[0].id}` })
    const times = comments.map((c: Json) => c.created_at)
    expect([...times].sort().reverse()).toEqual(times)
  })
})
