import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestGet as streamRoute } from '../functions/api/stream/[id]'
import { onRequestGet as getRoute } from '../functions/api/videos/[id]'
import { onRequestPost as viewRoute } from '../functions/api/videos/[id]/view'
import { createUser, createVideo, first, run, type User, type VideoStatus } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { VIEW_WINDOW_MINUTES } from '../functions/lib/videos'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, otherCreator: User, viewer: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('stream-test', { r2: true })
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
const SIZE = 1000
// Byte i of every test file is i % 251, so any slice can be checked exactly.
const BYTES = Uint8Array.from({ length: SIZE }, (_, i) => i % 251)

let seq = 0
async function video(status: VideoStatus, owner = creator) {
  seq++
  const key = `videos/stream-${seq}.mp4`
  await env.MEDIA.put(key, BYTES, { httpMetadata: { contentType: 'video/mp4' } })
  const v = (await createVideo(env.DB, { title: `V${seq}`, description: '', r2_key: key, thumbnail_key: null, status, uploaded_by: owner.id }))!
  if (status === 'published') await run(env.DB, "UPDATE videos SET published_at = '2026-10-01T00:00:00Z' WHERE id = ?", v.id)
  return v
}

async function call(handlers: unknown, user: User, method: string, path: string, id: number, headers: Record<string, string> = {}) {
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  return runChain(chain, { env, data: { email: user.email, user }, request: new Request(BASE + path, { method, headers }), params: { id: String(id) } })
}

const stream = (user: User, id: number, range?: string) =>
  call(streamRoute, user, 'GET', `/api/stream/${id}`, id, range ? { Range: range } : {})

const view = async (user: User, id: number) => {
  const res = await call(viewRoute, user, 'POST', `/api/videos/${id}/view`, id)
  return { status: res.status, json: (await res.json()) as { counted: boolean; view_count: number } }
}

describe('GET /api/stream/:id', () => {
  it('streams a whole published video with Accept-Ranges', async () => {
    const v = await video('published')
    const res = await stream(viewer, v.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Content-Length')).toBe(String(SIZE))
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES)
  })

  it('answers a Range with 206 and the exact bytes, as a seek does', async () => {
    const v = await video('published')
    for (const [range, start, end] of [
      ['bytes=0-1', 0, 1],
      ['bytes=500-599', 500, 599],
      ['bytes=900-', 900, 999],
      ['bytes=-10', 990, 999],
      ['bytes=950-5000', 950, 999],
    ] as const) {
      const res = await stream(viewer, v.id, range)
      expect(res.status).toBe(206)
      expect(res.headers.get('Content-Range')).toBe(`bytes ${start}-${end}/${SIZE}`)
      expect(res.headers.get('Content-Length')).toBe(String(end - start + 1))
      expect(res.headers.get('Accept-Ranges')).toBe('bytes')
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES.slice(start, end + 1))
    }
  })

  it('answers 416 for a range past the end', async () => {
    const v = await video('published')
    const res = await stream(viewer, v.id, 'bytes=1000-')
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe(`bytes */${SIZE}`)
  })

  it('streams a draft to its uploader and the admin only', async () => {
    const draft = await video('draft')
    expect((await stream(creator, draft.id, 'bytes=0-9')).status).toBe(206)
    expect((await stream(admin, draft.id)).status).toBe(200)
    expect((await stream(viewer, draft.id)).status).toBe(404)
    expect((await stream(otherCreator, draft.id)).status).toBe(404)
  })

  it('refuses pending users and unknown videos', async () => {
    const v = await video('published')
    expect((await stream(pending, v.id)).status).toBe(403)
    expect((await stream(viewer, 99999)).status).toBe(404)
  })
})

describe('POST /api/videos/:id/view', () => {
  it('counts a view once, ignoring repeats from the same user within the window', async () => {
    const v = await video('published')
    expect((await view(viewer, v.id)).json).toEqual({ counted: true, view_count: 1 })
    expect((await view(viewer, v.id)).json).toEqual({ counted: false, view_count: 1 })
    expect((await view(viewer, v.id)).json).toEqual({ counted: false, view_count: 1 })
    // Someone else's view still counts.
    expect((await view(creator, v.id)).json).toEqual({ counted: true, view_count: 2 })
  })

  it('counts the same user again once the window has passed', async () => {
    const v = await video('published')
    await view(viewer, v.id)
    await run(
      env.DB,
      "UPDATE views SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) WHERE video_id = ?",
      `-${VIEW_WINDOW_MINUTES + 1} minutes`,
      v.id,
    )
    expect((await view(viewer, v.id)).json).toEqual({ counted: true, view_count: 2 })
  })

  it('does not count views of a draft, and hides it from those who cannot see it', async () => {
    const draft = await video('draft')
    expect((await view(creator, draft.id)).json).toEqual({ counted: false, view_count: 0 })
    expect((await view(admin, draft.id)).json).toEqual({ counted: false, view_count: 0 })
    expect((await view(viewer, draft.id)).status).toBe(404)
    expect(await first(env.DB, 'SELECT 1 FROM views WHERE video_id = ?', draft.id)).toBeNull()
  })

  it('refuses pending users', async () => {
    const v = await video('published')
    expect((await view(pending, v.id)).status).toBe(403)
  })

  it('shows the count on GET /api/videos/:id', async () => {
    const v = await video('published')
    await view(viewer, v.id)
    await view(admin, v.id)
    const res = await call(getRoute, viewer, 'GET', `/api/videos/${v.id}`, v.id)
    expect(((await res.json()) as { video: { view_count: number } }).video.view_count).toBe(2)
  })
})
