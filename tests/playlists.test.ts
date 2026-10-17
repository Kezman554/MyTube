import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestGet as adminListRoute, onRequestPost as createRoute } from '../functions/api/admin/playlists/index'
import { onRequestDelete as deleteRoute, onRequestPatch as patchRoute } from '../functions/api/admin/playlists/[id]/index'
import { onRequestPut as orderRoute } from '../functions/api/admin/playlists/[id]/order'
import { onRequestPost as addRoute } from '../functions/api/admin/playlists/[id]/videos/index'
import { onRequestDelete as removeRoute } from '../functions/api/admin/playlists/[id]/videos/[videoId]'
import { onRequestGet as viewerGetRoute } from '../functions/api/playlists/[id]'
import { onRequestGet as viewerListRoute } from '../functions/api/playlists/index'
import { createUser, createVideo, first, getVideo, run, type User, type VideoStatus } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, viewer: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('playlists-test', { r2: true })
  mf = test.mf
  env = { DB: test.db, MEDIA: test.bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  creator = (await createUser(env.DB, 'son@example.com', 'CrAzYeNdErMaN', 'creator', 'approved'))!
  viewer = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  pending = (await createUser(env.DB, 'new@example.com', 'Newbie', 'viewer', 'pending'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev'
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let seq = 0
async function video(title: string, status: VideoStatus = 'published', thumbnail = false) {
  seq++
  return (await createVideo(env.DB, {
    title,
    description: '',
    r2_key: `videos/playlist-test-${seq}.mp4`,
    thumbnail_key: thumbnail ? `thumbnails/playlist-test-${seq}aaaaaaaa.png` : null,
    status,
    uploaded_by: creator.id,
  }))!
}

async function call(handlers: unknown, user: User, method: string, path: string, body?: unknown, params: Record<string, string> = {}) {
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const request = new Request(BASE + path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  const res = await runChain(chain, { env, data: { email: user.email, user }, request, params })
  return { status: res.status, json: (await res.json()) as Json }
}

const create = (user: User, body: unknown) => call(createRoute, user, 'POST', '/api/admin/playlists', body)
const add = (user: User, id: number, videoId: unknown) =>
  call(addRoute, user, 'POST', `/api/admin/playlists/${id}/videos`, { videoId }, { id: String(id) })
const remove = (user: User, id: number, videoId: number) =>
  call(removeRoute, user, 'DELETE', `/api/admin/playlists/${id}/videos/${videoId}`, undefined, { id: String(id), videoId: String(videoId) })
const order = (user: User, id: number, videoIds: unknown) =>
  call(orderRoute, user, 'PUT', `/api/admin/playlists/${id}/order`, { videoIds }, { id: String(id) })
const patch = (user: User, id: number, body: unknown) =>
  call(patchRoute, user, 'PATCH', `/api/admin/playlists/${id}`, body, { id: String(id) })
const del = (user: User, id: number) => call(deleteRoute, user, 'DELETE', `/api/admin/playlists/${id}`, undefined, { id: String(id) })
const viewerGet = (user: User, id: number) => call(viewerGetRoute, user, 'GET', `/api/playlists/${id}`, undefined, { id: String(id) })
const viewerList = (user: User) => call(viewerListRoute, user, 'GET', '/api/playlists')

const titles = (videos: Json[]) => videos.map((v) => v.title)

describe('a playlist from start to finish', () => {
  it('is created with three videos, reordered, and fetched by a viewer in the new order', async () => {
    const one = await video('Ender Farm 1', 'published', true)
    const two = await video('Ender Farm 2')
    const three = await video('Ender Farm 3')

    const created = await create(admin, { title: '  Ender Farm Series ', description: 'All the parts' })
    expect(created.status).toBe(201)
    expect(created.json.playlist).toMatchObject({ title: 'Ender Farm Series', description: 'All the parts', videos: [] })
    const id = created.json.playlist.id

    for (const v of [one, two, three]) expect((await add(admin, id, v.id)).status).toBe(201)
    const before = await viewerGet(viewer, id)
    expect(titles(before.json.videos)).toEqual(['Ender Farm 1', 'Ender Farm 2', 'Ender Farm 3'])

    const reordered = await order(admin, id, [three.id, one.id, two.id])
    expect(reordered.status).toBe(200)
    expect(titles(reordered.json.playlist.videos)).toEqual(['Ender Farm 3', 'Ender Farm 1', 'Ender Farm 2'])

    const { status, json } = await viewerGet(viewer, id)
    expect(status).toBe(200)
    expect(json.playlist).toMatchObject({ id, title: 'Ender Farm Series', description: 'All the parts' })
    expect(titles(json.videos)).toEqual(['Ender Farm 3', 'Ender Farm 1', 'Ender Farm 2'])
    expect(json.videos[0]).not.toHaveProperty('r2_key')

    // The viewer's list shows it with its count, and the first video with a thumbnail as its cover.
    const summary = (await viewerList(viewer)).json.playlists.find((p: Json) => p.id === id)
    expect(summary).toMatchObject({ title: 'Ender Farm Series', video_count: 3 })
    expect(summary.thumbnail_url).toMatch(new RegExp(`^/api/thumbnails/${one.id}\\?v=`))
  })
})

describe('viewers only see published videos', () => {
  it('leaves drafts out of a playlist, its count and its cover, but the admin sees them', async () => {
    const live = await video('Live')
    const draft = await video('Draft', 'draft', true)
    const id = (await create(admin, { title: 'Mixed' })).json.playlist.id
    await add(admin, id, draft.id)
    await add(admin, id, live.id)

    expect(titles((await viewerGet(viewer, id)).json.videos)).toEqual(['Live'])
    expect(titles((await viewerGet(creator, id)).json.videos)).toEqual(['Live'])
    const summary = (await viewerList(viewer)).json.playlists.find((p: Json) => p.id === id)
    expect(summary).toMatchObject({ video_count: 1, thumbnail_url: null })

    const adminView = (await call(adminListRoute, admin, 'GET', '/api/admin/playlists')).json.playlists.find((p: Json) => p.id === id)
    expect(adminView.videos.map((v: Json) => [v.title, v.status])).toEqual([['Draft', 'draft'], ['Live', 'published']])
  })

  it('shows a draft in its place once it is published', async () => {
    const a = await video('A')
    const b = await video('B', 'draft')
    const c = await video('C')
    const id = (await create(admin, { title: 'Publishing' })).json.playlist.id
    for (const v of [a, b, c]) await add(admin, id, v.id)
    expect(titles((await viewerGet(viewer, id)).json.videos)).toEqual(['A', 'C'])
    await run(env.DB, "UPDATE videos SET status = 'published', published_at = '2026-10-17T00:00:00Z' WHERE id = ?", b.id)
    expect(titles((await viewerGet(viewer, id)).json.videos)).toEqual(['A', 'B', 'C'])
  })

  it('leaves playlists with no published videos out of the list, but still opens them', async () => {
    const id = (await create(admin, { title: 'Nothing live yet' })).json.playlist.id
    await add(admin, id, (await video('Only a draft', 'draft')).id)
    expect((await viewerList(viewer)).json.playlists.some((p: Json) => p.id === id)).toBe(false)
    expect(await viewerGet(viewer, id)).toMatchObject({ status: 200, json: { videos: [] } })
  })

  it('gives pending users 403 and unknown playlists 404', async () => {
    const id = (await create(admin, { title: 'Any' })).json.playlist.id
    expect((await viewerGet(pending, id)).status).toBe(403)
    expect((await viewerList(pending)).status).toBe(403)
    expect((await viewerGet(viewer, 99999)).status).toBe(404)
  })
})

describe('admin playlist management', () => {
  it('removes a video and closes the gap in the order', async () => {
    const [a, b, c] = [await video('A'), await video('B'), await video('C')]
    const id = (await create(admin, { title: 'Gaps' })).json.playlist.id
    for (const v of [a, b, c]) await add(admin, id, v.id)

    const res = await remove(admin, id, b.id)
    expect(titles(res.json.playlist.videos)).toEqual(['A', 'C'])
    const positions = await first<{ list: string }>(
      env.DB,
      'SELECT group_concat(position) AS list FROM (SELECT position FROM playlist_videos WHERE playlist_id = ? ORDER BY position)',
      id,
    )
    expect(positions!.list).toBe('1,2')
    expect(await getVideo(env.DB, b.id)).not.toBeNull()

    // Added afterwards, it goes to the end.
    await add(admin, id, b.id)
    expect(titles((await viewerGet(viewer, id)).json.videos)).toEqual(['A', 'C', 'B'])
    expect((await remove(admin, id, 99999)).status).toBe(404)
  })

  it('refuses a duplicate, an unknown video or a bad id when adding', async () => {
    const v = await video('Once')
    const id = (await create(admin, { title: 'No dupes' })).json.playlist.id
    await add(admin, id, v.id)
    expect((await add(admin, id, v.id)).json.error).toBe('already_in_playlist')
    expect((await add(admin, id, 99999)).status).toBe(404)
    for (const bad of ['1', 0, -1, 1.5, null]) expect((await add(admin, id, bad)).status).toBe(400)
    expect((await add(admin, 99999, v.id)).status).toBe(404)
  })

  it('refuses an order that is not exactly the current videos', async () => {
    const [a, b] = [await video('A'), await video('B')]
    const id = (await create(admin, { title: 'Strict order' })).json.playlist.id
    await add(admin, id, a.id)
    await add(admin, id, b.id)
    for (const ids of [[a.id], [a.id, b.id, 99999], [a.id, a.id], [b.id, 99999]]) {
      expect((await order(admin, id, ids)).json.error).toBe('order_mismatch')
    }
    for (const bad of ['x', [String(a.id), String(b.id)], undefined]) expect((await order(admin, id, bad)).status).toBe(400)
    expect(titles((await viewerGet(viewer, id)).json.videos)).toEqual(['A', 'B'])
  })

  it('renames, validates and deletes, leaving the videos alone', async () => {
    const v = await video('Survivor')
    const id = (await create(admin, { title: 'Old name' })).json.playlist.id
    await add(admin, id, v.id)

    expect((await patch(admin, id, { title: 'New name' })).json.playlist).toMatchObject({ title: 'New name', description: '' })
    expect((await patch(admin, id, { description: 'Now with words' })).json.playlist).toMatchObject({ title: 'New name', description: 'Now with words' })
    expect((await patch(admin, id, { title: '  ' })).status).toBe(400)
    expect((await patch(admin, id, {})).json.error).toBe('no_changes')
    expect((await create(admin, { title: '' })).status).toBe(400)
    expect((await create(admin, { title: 'x'.repeat(101) })).status).toBe(400)
    expect((await create(admin, {})).status).toBe(400)

    expect(await del(admin, id)).toEqual({ status: 200, json: { ok: true } })
    expect((await viewerGet(viewer, id)).status).toBe(404)
    expect(await first(env.DB, 'SELECT 1 FROM playlist_videos WHERE playlist_id = ?', id)).toBeNull()
    expect(await getVideo(env.DB, v.id)).not.toBeNull()
    expect((await del(admin, id)).status).toBe(404)
  })

  it('drops a deleted video from its playlists', async () => {
    const [a, b] = [await video('Stays'), await video('Goes')]
    const id = (await create(admin, { title: 'Cascade' })).json.playlist.id
    await add(admin, id, a.id)
    await add(admin, id, b.id)
    await run(env.DB, 'DELETE FROM videos WHERE id = ?', b.id)
    expect(titles((await viewerGet(viewer, id)).json.videos)).toEqual(['Stays'])
    // The order still accepts exactly what's left.
    expect((await order(admin, id, [a.id])).status).toBe(200)
  })

  it('is admin only', async () => {
    const v = await video('Guarded')
    const id = (await create(admin, { title: 'Guarded' })).json.playlist.id
    for (const user of [creator, viewer]) {
      expect((await create(user, { title: 'Mine' })).status).toBe(403)
      expect((await add(user, id, v.id)).status).toBe(403)
      expect((await order(user, id, [])).status).toBe(403)
      expect((await patch(user, id, { title: 'x' })).status).toBe(403)
      expect((await del(user, id)).status).toBe(403)
      expect((await call(adminListRoute, user, 'GET', '/api/admin/playlists')).status).toBe(403)
    }
  })
})
