import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestPatch as patchUserRoute } from '../functions/api/admin/users/[id]'
import { onRequestGet as listRoute, onRequestPost as postRoute } from '../functions/api/videos/[id]/comments'
import { COMMENT_MAX } from '../functions/lib/comments'
import { createUser, createVideo, getUserById, run, type User, type VideoStatus } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, viewer: User, other: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('comments-test')
  mf = test.mf
  env = { DB: test.db, MEDIA: {} as R2Bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
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
  const v = (await createVideo(env.DB, { title: `V${seq}`, description: '', r2_key: `videos/c-${seq}.mp4`, thumbnail_key: null, status, uploaded_by: creator.id }))!
  if (status === 'published') await run(env.DB, "UPDATE videos SET published_at = '2026-10-01T00:00:00Z' WHERE id = ?", v.id)
  return v
}

// Calls a route as a user, reloading their row first so a mute made since is seen, as the
// middleware would on the next real request.
async function call(handlers: unknown, as: User, method: string, path: string, params: Record<string, string>, body?: unknown) {
  const user = (await getUserById(env.DB, as.id))!
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const request = new Request(BASE + path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  const res = await runChain(chain, { env, data: { email: user.email, user }, request, params })
  return { status: res.status, json: (await res.json()) as Json }
}

const post = (as: User, videoId: number, body: unknown) =>
  call(postRoute, as, 'POST', `/api/videos/${videoId}/comments`, { id: String(videoId) }, { body })
const list = (as: User, videoId: number) => call(listRoute, as, 'GET', `/api/videos/${videoId}/comments`, { id: String(videoId) })
const setCanComment = (canComment: boolean) =>
  call(patchUserRoute, admin, 'PATCH', `/api/admin/users/${viewer.id}`, { id: String(viewer.id) }, { can_comment: canComment })

describe('posting and listing', () => {
  it('posts a trimmed comment and lists comments newest first with username', async () => {
    const v = await video()
    const first = await post(viewer, v.id, '  That sledge run looks brilliant!  \r\n')
    expect(first.status).toBe(201)
    expect(first.json.comment).toMatchObject({ body: 'That sledge run looks brilliant!', user: { id: viewer.id, username: 'Grandma' } })
    expect(first.json.comment.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)

    await post(other, v.id, 'Best one yet!')
    await run(env.DB, "UPDATE comments SET created_at = '2026-10-02T00:00:00Z' WHERE id = ?", first.json.comment.id)

    const { status, json } = await list(creator, v.id)
    expect(status).toBe(200)
    expect(json.comments.map((c: Json) => [c.user.username, c.body])).toEqual([
      ['AuntieJo', 'Best one yet!'],
      ['Grandma', 'That sledge run looks brilliant!'],
    ])
    expect(JSON.stringify(json)).not.toContain('@example.com')
  })

  it('keeps line breaks inside a comment, normalised', async () => {
    const v = await video()
    const res = await post(viewer, v.id, 'Line one\r\nLine two')
    expect(res.json.comment.body).toBe('Line one\nLine two')
  })

  it('refuses empty, blank, over-long and non-text comments', async () => {
    const v = await video()
    for (const body of ['', '   \n\t ', 'x'.repeat(COMMENT_MAX + 1), 42, null, undefined]) {
      const res = await post(viewer, v.id, body)
      expect(res.status).toBe(400)
      expect(res.json.error).toBe('invalid_comment')
    }
    expect((await list(viewer, v.id)).json.comments).toEqual([])
  })

  it('allows exactly the limit, counting emoji as one character each', async () => {
    const v = await video()
    expect((await post(viewer, v.id, 'x'.repeat(COMMENT_MAX))).status).toBe(201)
    expect((await post(viewer, v.id, '🎉'.repeat(COMMENT_MAX))).status).toBe(201)
    expect((await post(viewer, v.id, '🎉'.repeat(COMMENT_MAX + 1))).status).toBe(400)
  })
})

describe('muting', () => {
  it('rejects a muted user\'s next post with 403, and accepts it again once unmuted', async () => {
    const v = await video()
    expect((await post(viewer, v.id, 'Before the mute')).status).toBe(201)

    expect((await setCanComment(false)).status).toBe(200)
    const blocked = await post(viewer, v.id, 'After the mute')
    expect(blocked.status).toBe(403)
    expect(blocked.json.error).toBe('muted')

    // Muted users still watch and read comments.
    expect((await list(viewer, v.id)).json.comments.map((c: Json) => c.body)).toEqual(['Before the mute'])
    // Other people are unaffected.
    expect((await post(other, v.id, 'Still here')).status).toBe(201)

    await setCanComment(true)
    expect((await post(viewer, v.id, 'Back again')).status).toBe(201)
  })
})

describe('who can comment where', () => {
  it('opens comments only on published videos, and hides a draft from those who cannot see it', async () => {
    const draft = await video('draft')
    expect((await post(creator, draft.id, 'Note to self')).json.error).toBe('not_published')
    expect((await list(creator, draft.id)).json.comments).toEqual([])
    expect((await post(viewer, draft.id, 'Hi')).status).toBe(404)
    expect((await list(viewer, draft.id)).status).toBe(404)
  })

  it('refuses pending users and unknown videos', async () => {
    const v = await video()
    expect((await post(pending, v.id, 'Hello')).status).toBe(403)
    expect((await list(pending, v.id)).status).toBe(403)
    expect((await post(viewer, 99999, 'Hello')).status).toBe(404)
  })
})
