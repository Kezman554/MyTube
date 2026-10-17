import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestDelete as deleteOrphanRoute, onRequestGet as listOrphansRoute } from '../functions/api/admin/orphans'
import { onRequestGet as thumbnailRoute } from '../functions/api/thumbnails/[id]'
import { onRequestGet as getVideoRoute, onRequestPatch as patchVideoRoute } from '../functions/api/videos/[id]'
import { onRequestPost as createVideoRoute } from '../functions/api/videos/index'
import { createUpload, createUser, getUploadByKey, markUploadComplete, type User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { newVideoKey } from '../functions/lib/storage'
import { MiB } from '../functions/lib/uploads'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, otherCreator: User, viewer: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('videos-test', { r2: true })
  mf = test.mf
  env = { DB: test.db, MEDIA: test.bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  creator = (await createUser(env.DB, 'son@example.com', 'CrAzYeNdErMaN', 'creator', 'approved'))!
  otherCreator = (await createUser(env.DB, 'cousin@example.com', 'Cousin', 'creator', 'approved'))!
  viewer = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  pending = (await createUser(env.DB, 'new@example.com', 'Newbie', 'viewer', 'pending'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev'
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

// Files as the server would see them: a video object in R2, with or without an upload row.
async function videoFile(owner: User | null, state: 'completed' | 'in_progress' | 'none' = 'completed') {
  const key = newVideoKey('clip.mp4')
  if (state !== 'in_progress') await env.MEDIA.put(key, new Uint8Array(64), { httpMetadata: { contentType: 'video/mp4' } })
  if (owner && state !== 'none') {
    const uploadId = crypto.randomUUID()
    await createUpload(env.DB, { upload_id: uploadId, r2_key: key, user_id: owner.id, filename: 'clip.mp4', content_type: 'video/mp4', size: 64 })
    if (state === 'completed') await markUploadComplete(env.DB, uploadId)
  }
  return key
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9])
const GIF = new TextEncoder().encode('GIF89a......')

// A multipart request with a real Content-Length, as a browser would send.
async function formRequest(method: string, path: string, fields: Record<string, string | Uint8Array>) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, typeof value === 'string' ? value : new File([value], 'thumb.bin'))
  }
  const encoded = new Response(form)
  const body = await encoded.arrayBuffer()
  return new Request(BASE + path, {
    method,
    body,
    headers: { 'Content-Type': encoded.headers.get('Content-Type')!, 'Content-Length': String(body.byteLength) },
  })
}

async function send(handlers: unknown, as: User, request: Request, params: Record<string, string> = {}) {
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  return runChain(chain, { env, data: { email: as.email, user: as }, request, params })
}

async function json(res: Response) {
  return { status: res.status, json: (await res.json()) as Json }
}

const create = async (as: User, fields: Record<string, string | Uint8Array>) =>
  json(await send(createVideoRoute, as, await formRequest('POST', '/api/videos', fields)))

const getVideo = async (as: User, id: number) =>
  json(await send(getVideoRoute, as, new Request(`${BASE}/api/videos/${id}`), { id: String(id) }))

const patchVideo = async (as: User, id: number, fields: Record<string, string | Uint8Array>) =>
  json(await send(patchVideoRoute, as, await formRequest('PATCH', `/api/videos/${id}`, fields), { id: String(id) }))

const thumb = (as: User, url: string, headers: Record<string, string> = {}) =>
  send(thumbnailRoute, as, new Request(BASE + url, { headers }), { id: url.split('/')[3].split('?')[0] })

describe('POST /api/videos, GET /api/videos/:id and GET /api/thumbnails/:id', () => {
  it('creates a draft from a finished upload with a thumbnail, then serves both', async () => {
    const key = await videoFile(creator)
    const created = await create(creator, { key, title: '  My Ender Farm  ', description: 'Part 1', thumbnail: PNG })
    expect(created.status).toBe(201)
    const video = created.json.video
    expect(video).toMatchObject({ title: 'My Ender Farm', description: 'Part 1', status: 'draft', uploaded_by: creator.id, published_at: null })
    expect(video.thumbnail_url).toMatch(new RegExp(`^/api/thumbnails/${video.id}\\?v=[0-9a-f]{8}$`))
    expect(video).not.toHaveProperty('r2_key')

    expect(await getVideo(creator, video.id)).toEqual({ status: 200, json: { video } })
    expect((await getVideo(admin, video.id)).status).toBe(200)

    const res = await thumb(creator, video.thumbnail_url)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)

    // Without the version: revalidate each time, and 304 when the browser's copy is current.
    const plain = await thumb(creator, `/api/thumbnails/${video.id}`)
    expect(plain.headers.get('Cache-Control')).toBe('private, no-cache')
    const etag = plain.headers.get('ETag')!
    await plain.arrayBuffer()
    const again = await thumb(creator, `/api/thumbnails/${video.id}`, { 'If-None-Match': etag })
    expect(again.status).toBe(304)
    expect(again.headers.get('ETag')).toBe(etag)
  })

  it("hides a draft and its thumbnail from other users, and blocks pending users at the gate", async () => {
    const { json: created } = await create(creator, { key: await videoFile(creator), title: 'Secret', thumbnail: JPEG })
    const { id, thumbnail_url } = created.video
    expect((await getVideo(viewer, id)).status).toBe(404)
    expect((await getVideo(otherCreator, id)).status).toBe(404)
    expect((await thumb(viewer, thumbnail_url)).status).toBe(404)
    expect((await thumb(pending, thumbnail_url)).status).toBe(403)
    expect((await getVideo(pending, id)).status).toBe(403)
  })

  it("lets viewers see a published video's thumbnail", async () => {
    const { json: created } = await create(admin, { key: await videoFile(admin), title: 'Live', thumbnail: JPEG, publish: 'true' })
    expect(created.video.status).toBe('published')
    expect(created.video.published_at).not.toBeNull()
    expect((await getVideo(viewer, created.video.id)).status).toBe(200)
    expect((await thumb(viewer, created.video.thumbnail_url)).headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('makes a thumbnail optional, and ignores publish from a creator', async () => {
    const { status, json: created } = await create(creator, { key: await videoFile(creator), title: 'No thumb', publish: 'true' })
    expect(status).toBe(201)
    expect(created.video).toMatchObject({ thumbnail_url: null, status: 'draft' })
  })

  it('gives viewers and pending users 403', async () => {
    const key = await videoFile(viewer)
    expect((await create(viewer, { key, title: 'x' })).status).toBe(403)
    expect((await create(pending, { key, title: 'x' })).status).toBe(403)
  })

  it('validates title, description and thumbnail', async () => {
    const key = await videoFile(creator)
    expect((await create(creator, { key })).json.error).toBe('invalid_title')
    expect((await create(creator, { key, title: '   ' })).json.error).toBe('invalid_title')
    expect((await create(creator, { key, title: 'x'.repeat(101) })).json.error).toBe('invalid_title')
    expect((await create(creator, { key, title: 'x', description: 'y'.repeat(5001) })).json.error).toBe('invalid_description')
    expect((await create(creator, { key, title: 'x', thumbnail: GIF })).status).toBe(415)
    expect((await create(creator, { key, title: 'x', thumbnail: 'not a file' })).status).toBe(400)
    const big = new Uint8Array(5 * MiB + 1)
    big.set(PNG)
    expect((await create(creator, { key, title: 'x', thumbnail: big })).status).toBe(413)
    // None of those created anything, so the upload is still free to use.
    expect((await create(creator, { key, title: 'x' })).status).toBe(201)
  })

  it('refuses a form without a Content-Length', async () => {
    const form = new FormData()
    form.set('title', 'x')
    const res = await send(createVideoRoute, creator, new Request(`${BASE}/api/videos`, { method: 'POST', body: form }))
    expect(res.status).toBe(411)
  })
})

describe('which video keys POST /api/videos accepts', () => {
  const refused = async (as: User, key: string) => {
    const res = await create(as, { key, title: 'x' })
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('invalid_video_key')
  }

  it("refuses a creator another user's upload", async () => {
    await refused(creator, await videoFile(otherCreator))
    await refused(creator, await videoFile(admin))
  })

  it('refuses an upload still in progress, even to its owner or the admin', async () => {
    const key = await videoFile(creator, 'in_progress')
    await refused(creator, key)
    await refused(admin, key)
  })

  it('refuses a creator an R2 object with no upload row', async () => {
    await refused(creator, await videoFile(null, 'none'))
  })

  it('refuses keys outside videos/, made-up keys and non-strings', async () => {
    await env.MEDIA.put('thumbnails/x.png', PNG)
    for (const key of ['thumbnails/x.png', 'videos/../thumbnails/x.png', 'videos/made-up.mp4', '', 'secrets.txt']) {
      await refused(admin, key)
    }
  })

  it('lets each upload back one video only', async () => {
    const key = await videoFile(creator)
    expect((await create(creator, { key, title: 'First' })).status).toBe(201)
    const second = await create(creator, { key, title: 'Second' })
    expect(second.status).toBe(409)
    expect(second.json.error).toBe('already_has_video')
    expect((await create(admin, { key, title: 'Third' })).status).toBe(409)
  })

  it("lets the admin use a creator's finished upload, credited to the creator", async () => {
    const { json: created } = await create(admin, { key: await videoFile(creator), title: 'For him' })
    expect(created.video.uploaded_by).toBe(creator.id)
  })
})

describe('PATCH /api/videos/:id', () => {
  it('lets a creator edit their own draft, and replaces the thumbnail', async () => {
    const { json: created } = await create(creator, { key: await videoFile(creator), title: 'Old', thumbnail: PNG })
    const id = created.video.id
    const oldThumb = (await env.MEDIA.list({ prefix: 'thumbnails/' })).objects.length

    const edited = await patchVideo(creator, id, { title: 'New', description: 'Better', thumbnail: JPEG })
    expect(edited.status).toBe(200)
    expect(edited.json.video).toMatchObject({ title: 'New', description: 'Better' })
    expect(edited.json.video.thumbnail_url).not.toBe(created.video.thumbnail_url)

    // The old thumbnail object is gone, so storage holds one per video.
    expect((await env.MEDIA.list({ prefix: 'thumbnails/' })).objects.length).toBe(oldThumb)
    expect((await thumb(creator, created.video.thumbnail_url)).headers.get('Content-Type')).toBe('image/jpeg')

    // Only the fields sent change.
    const titleOnly = await patchVideo(creator, id, { title: 'Newer' })
    expect(titleOnly.json.video).toMatchObject({ title: 'Newer', description: 'Better', thumbnail_url: edited.json.video.thumbnail_url })
  })

  it("stops a creator editing a published video, or anyone else's", async () => {
    const { json: published } = await create(admin, { key: await videoFile(creator), title: 'Out', publish: 'true' })
    expect(published.video.uploaded_by).toBe(creator.id)
    expect((await patchVideo(creator, published.video.id, { title: 'Sneaky' })).status).toBe(403)

    const { json: theirs } = await create(otherCreator, { key: await videoFile(otherCreator), title: 'Theirs' })
    expect((await patchVideo(creator, theirs.video.id, { title: 'Mine now' })).status).toBe(404)
    expect((await patchVideo(viewer, published.video.id, { title: 'x' })).status).toBe(403)
  })

  it('lets the admin edit any video, published or not', async () => {
    const { json: published } = await create(admin, { key: await videoFile(creator), title: 'Out', publish: 'true' })
    const res = await patchVideo(admin, published.video.id, { description: 'Fixed typo' })
    expect(res.json.video).toMatchObject({ title: 'Out', description: 'Fixed typo', status: 'published' })
  })

  it('validates edits and answers 404 for unknown ids', async () => {
    const { json: created } = await create(creator, { key: await videoFile(creator), title: 'T' })
    expect((await patchVideo(creator, created.video.id, {})).json.error).toBe('no_changes')
    expect((await patchVideo(creator, created.video.id, { title: ' ' })).json.error).toBe('invalid_title')
    expect((await patchVideo(creator, created.video.id, { thumbnail: GIF })).status).toBe(415)
    expect((await patchVideo(admin, 99999, { title: 'x' })).status).toBe(404)
  })
})

describe('leftover uploads: /api/admin/orphans', () => {
  const listOrphans = async (as: User) =>
    json(await send(listOrphansRoute, as, new Request(`${BASE}/api/admin/orphans`)))
  const deleteOrphan = async (as: User, key: string) =>
    json(await send(deleteOrphanRoute, as, new Request(`${BASE}/api/admin/orphans?key=${encodeURIComponent(key)}`, { method: 'DELETE' })))

  it('lists files with no video, both from before uploads were kept and finished but unsaved ones', async () => {
    const leftover = await videoFile(null, 'none')
    const unsaved = await videoFile(creator)
    const inProgress = await videoFile(creator, 'in_progress')
    const saved = await videoFile(creator)
    await create(creator, { key: saved, title: 'Saved' })

    const { status, json: body } = await listOrphans(admin)
    expect(status).toBe(200)
    const byKey = new Map(body.orphans.map((o: Json) => [o.key, o]))
    expect(byKey.get(leftover)).toMatchObject({ size: 64, uploaded_by: null, filename: null })
    expect(byKey.get(unsaved)).toMatchObject({ size: 64, uploaded_by: { id: creator.id, username: 'CrAzYeNdErMaN' }, filename: 'clip.mp4' })
    expect(byKey.has(inProgress)).toBe(false)
    expect(byKey.has(saved)).toBe(false)
  })

  it('lets the admin turn a leftover upload into a video, which takes it off the list', async () => {
    const leftover = await videoFile(null, 'none')
    const created = await create(admin, { key: leftover, title: 'Rescued', thumbnail: PNG })
    expect(created.status).toBe(201)
    expect(created.json.video.uploaded_by).toBe(admin.id)
    const { json: body } = await listOrphans(admin)
    expect(body.orphans.some((o: Json) => o.key === leftover)).toBe(false)
  })

  it('lets the admin delete a leftover file and its upload row', async () => {
    const leftover = await videoFile(null, 'none')
    const unsaved = await videoFile(creator)
    expect(await deleteOrphan(admin, leftover)).toEqual({ status: 200, json: { ok: true } })
    expect(await deleteOrphan(admin, unsaved)).toEqual({ status: 200, json: { ok: true } })
    expect(await env.MEDIA.head(leftover)).toBeNull()
    expect(await env.MEDIA.head(unsaved)).toBeNull()
    expect(await getUploadByKey(env.DB, unsaved)).toBeNull()
    const { json: body } = await listOrphans(admin)
    expect(body.orphans.some((o: Json) => o.key === leftover || o.key === unsaved)).toBe(false)
  })

  it("won't delete a file a video uses, an upload in progress, or anything outside videos/", async () => {
    const saved = await videoFile(creator)
    await create(creator, { key: saved, title: 'Keep me' })
    expect((await deleteOrphan(admin, saved)).status).toBe(409)
    expect(await env.MEDIA.head(saved)).not.toBeNull()
    expect((await deleteOrphan(admin, await videoFile(creator, 'in_progress'))).status).toBe(409)
    expect((await deleteOrphan(admin, 'thumbnails/x.png')).status).toBe(400)
    expect((await deleteOrphan(admin, 'videos/nothing-here.mp4')).status).toBe(404)
  })

  it('is admin only', async () => {
    const leftover = await videoFile(null, 'none')
    for (const who of [creator, viewer]) {
      expect((await listOrphans(who)).status).toBe(403)
      expect((await deleteOrphan(who, leftover)).status).toBe(403)
    }
    expect(await env.MEDIA.head(leftover)).not.toBeNull()
  })
})
