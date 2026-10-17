import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestGet as detailRoute } from '../functions/api/videos/[id]'
import { onRequestDelete as unlikeRoute, onRequestPost as likeRoute } from '../functions/api/videos/[id]/like'
import { createUser, createVideo, run, type User, type VideoStatus } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let creator: User, viewer: User, other: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('likes-test')
  mf = test.mf
  env = { DB: test.db, MEDIA: {} as R2Bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  creator = (await createUser(env.DB, 'son@example.com', 'CrAzYeNdErMaN', 'creator', 'approved'))!
  viewer = (await createUser(env.DB, 'nan@example.com', 'Grandma', 'viewer', 'approved'))!
  other = (await createUser(env.DB, 'jo@example.com', 'AuntieJo', 'viewer', 'approved'))!
  pending = (await createUser(env.DB, 'new@example.com', 'Newbie', 'viewer', 'pending'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev'
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let seq = 0
async function video(status: VideoStatus = 'published') {
  seq++
  const v = (await createVideo(env.DB, { title: `V${seq}`, description: '', r2_key: `videos/l-${seq}.mp4`, thumbnail_key: null, status, uploaded_by: creator.id }))!
  if (status === 'published') await run(env.DB, "UPDATE videos SET published_at = '2026-10-01T00:00:00Z' WHERE id = ?", v.id)
  return v
}

async function call(handlers: unknown, as: User, method: string, id: number) {
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const request = new Request(`${BASE}/api/videos/${id}/like`, { method })
  const res = await runChain(chain, { env, data: { email: as.email, user: as }, request, params: { id: String(id) } })
  return { status: res.status, json: (await res.json()) as Json }
}

const like = (as: User, id: number) => call(likeRoute, as, 'POST', id)
const unlike = (as: User, id: number) => call(unlikeRoute, as, 'DELETE', id)
const detail = async (as: User, id: number) => (await call(detailRoute, as, 'GET', id)).json.video

describe('liking and unliking as two users', () => {
  it('keeps a separate liked flag per user and a shared count', async () => {
    const v = await video()
    expect(await detail(viewer, v.id)).toMatchObject({ like_count: 0, liked: false })

    expect((await like(viewer, v.id)).json).toEqual({ liked: true, like_count: 1 })
    expect((await like(other, v.id)).json).toEqual({ liked: true, like_count: 2 })
    expect(await detail(viewer, v.id)).toMatchObject({ like_count: 2, liked: true })
    expect(await detail(other, v.id)).toMatchObject({ like_count: 2, liked: true })
    expect(await detail(creator, v.id)).toMatchObject({ like_count: 2, liked: false })

    expect((await unlike(viewer, v.id)).json).toEqual({ liked: false, like_count: 1 })
    expect(await detail(viewer, v.id)).toMatchObject({ like_count: 1, liked: false })
    expect(await detail(other, v.id)).toMatchObject({ like_count: 1, liked: true })

    expect((await unlike(other, v.id)).json).toEqual({ liked: false, like_count: 0 })
  })

  it('is idempotent: a repeat like or unlike changes nothing', async () => {
    const v = await video()
    await like(viewer, v.id)
    expect((await like(viewer, v.id)).json).toEqual({ liked: true, like_count: 1 })
    await unlike(viewer, v.id)
    expect((await unlike(viewer, v.id)).json).toEqual({ liked: false, like_count: 0 })
  })
})

describe('who can like what', () => {
  it('refuses pending users and unknown videos', async () => {
    const v = await video()
    expect((await like(pending, v.id)).status).toBe(403)
    expect((await unlike(pending, v.id)).status).toBe(403)
    expect((await like(viewer, 99999)).status).toBe(404)
  })

  it('hides drafts from others and does not open likes on a draft', async () => {
    const draft = await video('draft')
    expect((await like(viewer, draft.id)).status).toBe(404)
    const own = await like(creator, draft.id)
    expect(own.status).toBe(409)
    expect(own.json.error).toBe('not_published')
  })
})
