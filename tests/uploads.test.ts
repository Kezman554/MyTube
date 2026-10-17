import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestPost as abortRoute } from '../functions/api/uploads/abort'
import { onRequestPost as completeRoute } from '../functions/api/uploads/complete'
import { onRequestPut as partRoute } from '../functions/api/uploads/part'
import { onRequestPost as startRoute } from '../functions/api/uploads/start'
import { createUser, getUpload, type User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { looksLikeVideo, MAX_PART_BYTES, MiB, videoContentType } from '../functions/lib/uploads'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, viewer: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('uploads-test', { r2: true })
  mf = test.mf
  env = { DB: test.db, MEDIA: test.bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  creator = (await createUser(env.DB, 'son@example.com', 'CrAzYeNdErMaN', 'creator', 'approved'))!
  viewer = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  pending = (await createUser(env.DB, 'new@example.com', 'Newbie', 'creator', 'pending'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev/api/uploads'
type Json = Record<string, unknown>

// Requests go through the approval gate as well as the route, as they would in Pages.
async function send(handlers: Parameters<typeof runChain>[0], as: User, request: Request) {
  const res = await runChain([gate, ...(handlers as never[])], { env, data: { email: as.email, user: as }, request })
  return { status: res.status, json: (await res.json()) as Json }
}

const post = (handlers: Parameters<typeof runChain>[0], as: User, path: string, body: unknown) =>
  send(handlers, as, new Request(`${BASE}/${path}`, { method: 'POST', body: JSON.stringify(body) }))

const start = (as: User, body: unknown) => post(startRoute, as, 'start', body)
const complete = (as: User, body: unknown) => post(completeRoute, as, 'complete', body)
const abort = (as: User, body: unknown) => post(abortRoute, as, 'abort', body)

function part(as: User, upload: Json, partNumber: number, bytes: Uint8Array, length = bytes.byteLength) {
  const query = new URLSearchParams({ uploadId: String(upload.uploadId), key: String(upload.key), partNumber: String(partNumber) })
  return send(
    partRoute,
    as,
    new Request(`${BASE}/part?${query}`, { method: 'PUT', body: bytes, headers: { 'Content-Length': String(length) } }),
  )
}

// Bytes that open like an MP4 file: a box size, then 'ftyp'.
function mp4Bytes(size: number, fill = 65) {
  const bytes = new Uint8Array(size).fill(fill)
  bytes.set([0, 0, 0, 24, ...new TextEncoder().encode('ftypisom')])
  return bytes
}

describe('upload rules', () => {
  it('accepts mp4, mov and webm only, by extension', () => {
    expect(videoContentType('Holiday.MP4')).toBe('video/mp4')
    expect(videoContentType('clip.mov')).toBe('video/quicktime')
    expect(videoContentType('clip.webm')).toBe('video/webm')
    for (const name of ['clip.avi', 'clip.mkv', 'clip.mp4.exe', 'clip', 'mp4']) expect(videoContentType(name)).toBeNull()
  })

  it('recognises each format by its first bytes', () => {
    expect(looksLikeVideo('video/mp4', mp4Bytes(16))).toBe(true)
    expect(looksLikeVideo('video/webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe(true)
    const oldMov = new Uint8Array([0, 0, 0, 8, ...new TextEncoder().encode('wide')])
    expect(looksLikeVideo('video/quicktime', oldMov)).toBe(true)
    expect(looksLikeVideo('video/mp4', oldMov)).toBe(false)
    expect(looksLikeVideo('video/mp4', new TextEncoder().encode('<html><body>hello'))).toBe(false)
    expect(looksLikeVideo('video/webm', mp4Bytes(16))).toBe(false)
  })
})

describe('/api/uploads', () => {
  it('uploads a video in parts and stores exactly those bytes', async () => {
    const part1 = mp4Bytes(5 * MiB)
    const part2 = new Uint8Array(3 * MiB + 7).fill(66)
    const size = part1.byteLength + part2.byteLength

    const started = await start(creator, { filename: 'Minecraft Build.mp4', size })
    expect(started.status).toBe(201)
    expect(started.json.key).toMatch(/^videos\/[0-9a-f-]{36}\.mp4$/)
    expect(started.json.partSize).toBe(10 * MiB)

    // Parts may arrive out of order, and a retried part replaces the first attempt.
    const p2 = await part(creator, started.json, 2, part2)
    await part(creator, started.json, 1, mp4Bytes(5 * MiB, 67))
    const p1 = await part(creator, started.json, 1, part1)
    expect(p1.status).toBe(200)
    expect(p1.json).toMatchObject({ partNumber: 1, etag: expect.any(String) })

    const done = await complete(creator, { ...started.json, parts: [p1.json, p2.json] })
    expect(done).toEqual({ status: 200, json: { key: started.json.key, size } })

    const object = await env.MEDIA.get(String(started.json.key))
    expect(object!.size).toBe(size)
    expect(object!.httpMetadata?.contentType).toBe('video/mp4')
    const stored = new Uint8Array(await object!.arrayBuffer())
    expect(stored[5 * MiB - 1]).toBe(65)
    expect(stored[5 * MiB]).toBe(66)
    expect(await getUpload(env.DB, String(started.json.uploadId))).toBeNull()
  })

  it('lets the admin upload too', async () => {
    const started = await start(admin, { filename: 'a.webm', size: 8 })
    expect(started.status).toBe(201)
    await abort(admin, started.json)
  })

  it('gives viewers 403 and pending users 403', async () => {
    expect((await start(viewer, { filename: 'a.mp4', size: 10 })).json).toEqual({ error: 'forbidden' })
    expect((await start(pending, { filename: 'a.mp4', size: 10 })).json).toEqual({ error: 'pending' })
  })

  it('refuses other file types, oversized videos and bad sizes when starting', async () => {
    expect((await start(creator, { filename: 'clip.avi', size: 10 })).status).toBe(415)
    expect((await start(creator, { filename: 'clip.mp4', size: 5 * 1024 ** 3 })).status).toBe(413)
    for (const size of [0, -1, 1.5, '10', undefined]) {
      expect((await start(creator, { filename: 'clip.mp4', size })).status).toBe(400)
    }
    expect((await start(creator, { size: 10 })).status).toBe(400)
  })

  it('refuses a first part that is not really a video', async () => {
    const started = await start(creator, { filename: 'sneaky.mp4', size: 100 })
    const res = await part(creator, started.json, 1, new TextEncoder().encode('<html>not a video at all</html>'))
    expect(res.status).toBe(415)
    expect(res.json.error).toBe('not_a_video')
    await abort(creator, started.json)
  })

  it('refuses a part over the size limit before reading it', async () => {
    const started = await start(creator, { filename: 'big.mp4', size: 100 * MiB })
    const res = await part(creator, started.json, 2, new Uint8Array(16), MAX_PART_BYTES + 1)
    expect(res.status).toBe(413)
    await abort(creator, started.json)
  })

  it('refuses bad part numbers', async () => {
    const started = await start(creator, { filename: 'a.mp4', size: 100 })
    for (const n of [0, -1, 10_001, 1.5]) expect((await part(creator, started.json, n, mp4Bytes(16))).status).toBe(400)
    await abort(creator, started.json)
  })

  it("hides another user's upload, and a mismatched key, behind 404", async () => {
    const started = await start(creator, { filename: 'mine.mp4', size: 16 })
    expect((await part(admin, started.json, 1, mp4Bytes(16))).status).toBe(404)
    expect((await abort(admin, started.json)).status).toBe(404)
    expect((await complete(admin, { ...started.json, parts: [{ partNumber: 1, etag: 'x' }] })).status).toBe(404)
    expect((await part(creator, { ...started.json, key: 'videos/other.mp4' }, 1, mp4Bytes(16))).status).toBe(404)
    await abort(creator, started.json)
  })

  it('deletes the object when the joined size differs from the declared size', async () => {
    const started = await start(creator, { filename: 'short.mp4', size: 1000 })
    const p1 = await part(creator, started.json, 1, mp4Bytes(16))
    const res = await complete(creator, { ...started.json, parts: [p1.json] })
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('size_mismatch')
    expect(await env.MEDIA.head(String(started.json.key))).toBeNull()
  })

  it('reports a failed join and keeps the upload open', async () => {
    const started = await start(creator, { filename: 'a.mp4', size: 16 })
    await part(creator, started.json, 1, mp4Bytes(16))
    const res = await complete(creator, { ...started.json, parts: [{ partNumber: 1, etag: 'wrong' }] })
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('complete_failed')
    expect(await getUpload(env.DB, String(started.json.uploadId))).not.toBeNull()
    await abort(creator, started.json)
  })

  it('refuses malformed parts lists', async () => {
    const started = await start(creator, { filename: 'a.mp4', size: 16 })
    for (const parts of [undefined, [], [{ partNumber: 1 }], [{ etag: 'x' }], 'x']) {
      expect((await complete(creator, { ...started.json, parts })).status).toBe(400)
    }
    await abort(creator, started.json)
  })

  it('aborts: the upload is forgotten and takes no more parts', async () => {
    const started = await start(creator, { filename: 'gone.mp4', size: 16 })
    await part(creator, started.json, 1, mp4Bytes(16))
    expect(await abort(creator, started.json)).toEqual({ status: 200, json: { ok: true } })
    expect(await getUpload(env.DB, String(started.json.uploadId))).toBeNull()
    expect((await part(creator, started.json, 1, mp4Bytes(16))).status).toBe(404)
    expect(await env.MEDIA.head(String(started.json.key))).toBeNull()
  })
})
