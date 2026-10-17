import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestGet as playlistRoute } from '../functions/api/playlists/[id]'
import { onRequestGet as listRoute } from '../functions/api/videos/index'
import { createUser, createVideo, run, type User, type VideoStatus } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { appendVideo, createPlaylist } from '../functions/lib/playlists'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, creator: User, viewer: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('channel-test', { r2: true })
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
async function video(title: string, status: VideoStatus, publishedAt?: string) {
  seq++
  const v = (await createVideo(env.DB, { title, description: '', r2_key: `videos/channel-${seq}.mp4`, thumbnail_key: null, status, uploaded_by: creator.id }))!
  if (publishedAt) await run(env.DB, 'UPDATE videos SET published_at = ? WHERE id = ?', publishedAt, v.id)
  return v
}

async function views(videoId: number, n: number) {
  for (let i = 0; i < n; i++) await run(env.DB, 'INSERT INTO views (video_id, user_id) VALUES (?, ?)', videoId, [viewer, creator, admin][i % 3].id)
}

async function likes(videoId: number, users: User[]) {
  for (const u of users) await run(env.DB, 'INSERT INTO likes (user_id, video_id) VALUES (?, ?)', u.id, videoId)
}

async function get(handlers: unknown, user: User, path: string, params: Record<string, string> = {}) {
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  const res = await runChain(chain, { env, data: { email: user.email, user }, request: new Request(BASE + path), params })
  return { status: res.status, json: (await res.json()) as Json }
}

describe('GET /api/videos', () => {
  let old: Json, recent: Json, newest: Json, draft: Json

  beforeAll(async () => {
    old = await video('Old', 'published', '2026-09-01T10:00:00Z')
    recent = await video('Recent', 'published', '2026-10-10T10:00:00Z')
    newest = await video('Newest', 'published', '2026-10-16T10:00:00Z')
    draft = await video('Unfinished', 'draft')
    await views(old.id, 23)
    await views(newest.id, 1)
    await likes(old.id, [viewer, admin])
    await likes(recent.id, [viewer])
    await views(draft.id, 2)
  })

  it('gives a viewer the published videos, newest first, with view and like counts', async () => {
    const { status, json } = await get(listRoute, viewer, '/api/videos')
    expect(status).toBe(200)
    expect(json.videos.map((v: Json) => [v.title, v.view_count, v.like_count])).toEqual([
      ['Newest', 1, 0],
      ['Recent', 0, 1],
      ['Old', 23, 2],
    ])
    expect(json.videos.every((v: Json) => v.status === 'published')).toBe(true)
    expect(json.videos[0]).not.toHaveProperty('r2_key')
  })

  it('also gives the creator their own draft, with its counts', async () => {
    const { json } = await get(listRoute, creator, '/api/videos')
    expect(json.videos.find((v: Json) => v.id === draft.id)).toMatchObject({ status: 'draft', view_count: 2, like_count: 0 })
  })

  it('refuses a pending user', async () => {
    expect((await get(listRoute, pending, '/api/videos')).status).toBe(403)
  })

  it('carries the same counts on a playlist page', async () => {
    const playlist = (await createPlaylist(env.DB, 'Counted', ''))!
    await appendVideo(env.DB, playlist.id, old.id)
    await appendVideo(env.DB, playlist.id, recent.id)
    const { json } = await get(playlistRoute, viewer, `/api/playlists/${playlist.id}`, { id: String(playlist.id) })
    expect(json.videos.map((v: Json) => [v.title, v.view_count, v.like_count])).toEqual([
      ['Old', 23, 2],
      ['Recent', 0, 1],
    ])
  })
})
