import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestGet as reviewQueueRoute } from '../functions/api/admin/videos/index'
import { onRequestPost as publishRoute } from '../functions/api/admin/videos/[id]/publish'
import { onRequestPost as rejectRoute } from '../functions/api/admin/videos/[id]/reject'
import { onRequestGet as thumbnailRoute } from '../functions/api/thumbnails/[id]'
import { onRequestDelete as deleteRoute, onRequestGet as getRoute } from '../functions/api/videos/[id]'
import { onRequestGet as listRoute } from '../functions/api/videos/index'
import {
  createUpload,
  createUser,
  createVideo,
  first,
  getUploadByKey,
  getVideo,
  markUploadComplete,
  run,
  type User,
  type VideoStatus,
} from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { newThumbnailKey, newVideoKey } from '../functions/lib/storage'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, otherCreator: User, viewer: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('review-test', { r2: true })
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

// A video as a finished upload leaves it: files in R2, a completed upload row, and the record.
async function seedVideo(owner: User, title: string, status: VideoStatus = 'draft') {
  const key = newVideoKey('clip.mp4')
  const thumbnailKey = newThumbnailKey('t.png')
  await env.MEDIA.put(key, new Uint8Array(32), { httpMetadata: { contentType: 'video/mp4' } })
  await env.MEDIA.put(thumbnailKey, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { httpMetadata: { contentType: 'image/png' } })
  const uploadId = crypto.randomUUID()
  await createUpload(env.DB, { upload_id: uploadId, r2_key: key, user_id: owner.id, filename: 'clip.mp4', content_type: 'video/mp4', size: 32 })
  await markUploadComplete(env.DB, uploadId)
  const video = (await createVideo(env.DB, { title, description: '', r2_key: key, thumbnail_key: thumbnailKey, status, uploaded_by: owner.id }))!
  return video
}

async function as(handlers: unknown, user: User, method: string, path: string, params: Record<string, string> = {}) {
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const res = await runChain(chain, { env, data: { email: user.email, user }, request: new Request(BASE + path, { method }), params })
  return { status: res.status, json: (await res.json().catch(() => null)) as Json }
}

const list = async (user: User) => ((await as(listRoute, user, 'GET', '/api/videos')).json.videos as Json[]).map((v) => v.title)
const getOne = (user: User, id: number) => as(getRoute, user, 'GET', `/api/videos/${id}`, { id: String(id) })
const thumbnail = (user: User, id: number) => as(thumbnailRoute, user, 'GET', `/api/thumbnails/${id}`, { id: String(id) })
const publish = (user: User, id: number) => as(publishRoute, user, 'POST', `/api/admin/videos/${id}/publish`, { id: String(id) })
const reject = (user: User, id: number) => as(rejectRoute, user, 'POST', `/api/admin/videos/${id}/reject`, { id: String(id) })
const remove = (user: User, id: number) => as(deleteRoute, user, 'DELETE', `/api/videos/${id}`, { id: String(id) })

describe('who sees drafts', () => {
  it('a viewer cannot see drafts, in the list, by id or by thumbnail', async () => {
    const draft = await seedVideo(creator, 'Viewer cannot see me')
    await seedVideo(creator, 'Already out', 'published')
    expect(await list(viewer)).toContain('Already out')
    expect(await list(viewer)).not.toContain('Viewer cannot see me')
    expect((await getOne(viewer, draft.id)).status).toBe(404)
    expect((await thumbnail(viewer, draft.id)).status).toBe(404)
  })

  it('the creator sees their own draft, but not another creator\'s', async () => {
    const mine = await seedVideo(creator, 'My draft')
    const theirs = await seedVideo(otherCreator, 'Their draft')
    const titles = await list(creator)
    expect(titles).toContain('My draft')
    expect(titles).not.toContain('Their draft')
    expect((await getOne(creator, mine.id)).json.video).toMatchObject({ title: 'My draft', status: 'draft' })
    expect((await getOne(creator, theirs.id)).status).toBe(404)
    expect((await thumbnail(creator, mine.id)).status).toBe(200)
  })

  it('the admin publish makes a draft visible to everyone', async () => {
    const draft = await seedVideo(creator, 'Going live')
    expect(await list(viewer)).not.toContain('Going live')

    const res = await publish(admin, draft.id)
    expect(res.status).toBe(200)
    expect(res.json.video).toMatchObject({ id: draft.id, status: 'published', published_at: expect.any(String) })

    expect(await list(viewer)).toContain('Going live')
    expect(await list(otherCreator)).toContain('Going live')
    expect((await getOne(viewer, draft.id)).json.video.status).toBe('published')
    expect((await thumbnail(viewer, draft.id)).status).toBe(200)
  })

  it('pending users see nothing at all', async () => {
    const published = await seedVideo(admin, 'Public', 'published')
    expect((await as(listRoute, pending, 'GET', '/api/videos')).status).toBe(403)
    expect((await getOne(pending, published.id)).status).toBe(403)
  })

  it('lists newest first, drafts by when they were saved', async () => {
    const older = await seedVideo(creator, 'Older', 'published')
    await run(env.DB, "UPDATE videos SET published_at = '2026-01-01T00:00:00Z' WHERE id = ?", older.id)
    await seedVideo(creator, 'Newest draft')
    const titles = await list(creator)
    expect(titles.indexOf('Newest draft')).toBeLessThan(titles.indexOf('Older'))
  })

  it("the admin's review queue holds every draft, and only drafts", async () => {
    const a = await seedVideo(creator, 'Queue A')
    const b = await seedVideo(otherCreator, 'Queue B')
    const { status, json } = await as(reviewQueueRoute, admin, 'GET', '/api/admin/videos')
    expect(status).toBe(200)
    const ids = json.videos.map((v: Json) => v.id)
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]))
    expect(json.videos.every((v: Json) => v.status === 'draft')).toBe(true)
    expect((await as(reviewQueueRoute, creator, 'GET', '/api/admin/videos')).status).toBe(403)
  })
})

describe('publish', () => {
  it('is idempotent, keeping the first publish time', async () => {
    const draft = await seedVideo(creator, 'Twice')
    const first = await publish(admin, draft.id)
    const second = await publish(admin, draft.id)
    expect(second.status).toBe(200)
    expect(second.json.video.published_at).toBe(first.json.video.published_at)
  })

  it('is admin only', async () => {
    const draft = await seedVideo(creator, 'Self-publish attempt')
    expect((await publish(creator, draft.id)).status).toBe(403)
    expect((await publish(viewer, draft.id)).status).toBe(403)
    expect((await getVideo(env.DB, draft.id))!.status).toBe('draft')
  })

  it('answers 404 for an unknown video', async () => {
    expect((await publish(admin, 99999)).status).toBe(404)
  })
})

describe('reject and delete', () => {
  it('reject deletes the draft record, its files and its upload row', async () => {
    const draft = await seedVideo(creator, 'Not this one')
    expect(await reject(admin, draft.id)).toEqual({ status: 200, json: { ok: true } })
    expect(await getVideo(env.DB, draft.id)).toBeNull()
    expect(await env.MEDIA.head(draft.r2_key)).toBeNull()
    expect(await env.MEDIA.head(draft.thumbnail_key!)).toBeNull()
    expect(await getUploadByKey(env.DB, draft.r2_key)).toBeNull()
    expect(await list(creator)).not.toContain('Not this one')
  })

  it('reject refuses a published video, leaving it untouched', async () => {
    const live = await seedVideo(creator, 'Live one', 'published')
    const res = await reject(admin, live.id)
    expect(res.status).toBe(409)
    expect(res.json.error).toBe('not_a_draft')
    expect(await getVideo(env.DB, live.id)).not.toBeNull()
    expect(await env.MEDIA.head(live.r2_key)).not.toBeNull()
  })

  it('the admin can delete a published video, along with its likes, comments and views', async () => {
    const live = await seedVideo(creator, 'Remove me', 'published')
    await run(env.DB, 'INSERT INTO likes (user_id, video_id) VALUES (?, ?)', viewer.id, live.id)
    await run(env.DB, "INSERT INTO comments (video_id, user_id, body) VALUES (?, ?, 'Nice!')", live.id, viewer.id)
    await run(env.DB, 'INSERT INTO views (video_id, user_id) VALUES (?, ?)', live.id, viewer.id)

    expect(await remove(admin, live.id)).toEqual({ status: 200, json: { ok: true } })
    expect(await getVideo(env.DB, live.id)).toBeNull()
    expect(await env.MEDIA.head(live.r2_key)).toBeNull()
    expect(await env.MEDIA.head(live.thumbnail_key!)).toBeNull()
    for (const table of ['likes', 'comments', 'views']) {
      expect(await first(env.DB, `SELECT 1 FROM ${table} WHERE video_id = ?`, live.id)).toBeNull()
    }
  })

  it('the admin can delete a draft too', async () => {
    const draft = await seedVideo(creator, 'Draft to delete')
    expect((await remove(admin, draft.id)).status).toBe(200)
    expect(await getVideo(env.DB, draft.id)).toBeNull()
  })

  it('reject and delete are admin only, even for your own draft', async () => {
    const mine = await seedVideo(creator, 'Keep me')
    for (const res of [await reject(creator, mine.id), await remove(creator, mine.id), await remove(viewer, mine.id)]) {
      expect(res.status).toBe(403)
    }
    expect(await getVideo(env.DB, mine.id)).not.toBeNull()
    expect(await env.MEDIA.head(mine.r2_key)).not.toBeNull()
  })

  it('answer 404 for an unknown video', async () => {
    expect((await reject(admin, 99999)).status).toBe(404)
    expect((await remove(admin, 99999)).status).toBe(404)
  })
})
