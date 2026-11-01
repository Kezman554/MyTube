import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestGet as dashboardRoute } from '../functions/api/admin/dashboard'
import { dashboard, iso, R2_FREE_BYTES } from '../functions/lib/dashboard'
import { createUser, createVideo, getUserById, run, type User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { POWERS, setPowers } from '../functions/lib/powers'
import { listAllObjects } from '../functions/lib/storage'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, kid: User, nan: User, helper: User

// A fixed "now", so every window boundary is exact.
const NOW = new Date('2026-11-01T12:00:00Z')
const at = (daysAgo: number, seconds = 0) => iso(new Date(NOW.getTime() - daysAgo * 86_400_000 + seconds * 1000))

beforeAll(async () => {
  const test = await createTestDb('dashboard-test', { r2: true })
  mf = test.mf
  env = { DB: test.db, MEDIA: test.bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  kid = (await createUser(env.DB, 'son@example.com', 'Oli', 'viewer', 'approved'))!
  nan = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  helper = (await createUser(env.DB, 'helper@example.com', 'Helper', 'viewer', 'approved'))!
  await setPowers(env.DB, helper.id, [...POWERS])
  // Registered long ago, so only the users added in a test count as new.
  await run(env.DB, "UPDATE users SET created_at = '2026-01-01T00:00:00Z'")
})

afterAll(async () => {
  await mf.dispose()
})

let seq = 0
async function video(status: 'published' | 'draft' = 'published', owner: User = admin) {
  seq++
  const v = (await createVideo(env.DB, { title: `D${seq}`, description: '', r2_key: `videos/d-${seq}.mp4`, thumbnail_key: null, status, uploaded_by: owner.id }))!
  if (status === 'published') await run(env.DB, "UPDATE videos SET published_at = '2026-09-01T00:00:00Z' WHERE id = ?", v.id)
  return v
}
const view = (videoId: number, who: User, when: string) => run(env.DB, 'INSERT INTO views (video_id, user_id, created_at) VALUES (?, ?, ?)', videoId, who.id, when)
const clear = async () => {
  for (const t of ['views', 'likes', 'comments', 'videos']) await run(env.DB, `DELETE FROM ${t}`)
}

describe('the 7-day windows', () => {
  it('splits at exactly 7 and 14 days, includes now and leaves out anything later', async () => {
    await clear()
    const v = await video()
    for (const when of [
      at(0), // now: this week
      at(7, 1), // one second inside this week
      at(7), // exactly 7 days ago: last week
      at(14, 1), // one second inside last week
      at(14), // exactly 14 days ago: outside both
      at(0, 1), // a second in the future: outside both
    ]) await view(v.id, kid, when)
    const { week } = await dashboard(env.DB, env.MEDIA, NOW)
    expect(week.views).toEqual({ current: 2, previous: 2 })
  })

  it('compares likes, comments and new users week on week', async () => {
    await clear()
    const a = await video()
    const b = await video()
    await run(env.DB, 'INSERT INTO likes (video_id, user_id, created_at) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', a.id, kid.id, at(1), a.id, nan.id, at(2), b.id, kid.id, at(9))
    for (const [when, body] of [[at(3), 'one'], [at(8), 'two'], [at(10), 'three'], [at(13), 'four'], [at(20), 'old']]) {
      await run(env.DB, 'INSERT INTO comments (video_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', a.id, nan.id, body, when)
    }
    const newbie = (await createUser(env.DB, 'new1@example.com', 'NewOne', 'viewer', 'pending'))!
    const newer = (await createUser(env.DB, 'new2@example.com', 'NewTwo', 'viewer', 'approved'))!
    await run(env.DB, 'UPDATE users SET created_at = ? WHERE id = ?', at(2), newbie.id)
    await run(env.DB, 'UPDATE users SET created_at = ? WHERE id = ?', at(12), newer.id)

    const { week, attention } = await dashboard(env.DB, env.MEDIA, NOW)
    expect(week.likes).toEqual({ current: 2, previous: 1 })
    expect(week.comments).toEqual({ current: 1, previous: 3 })
    expect(week.users).toEqual({ current: 1, previous: 1 })
    expect(attention.pending_users).toBe(1)
    await run(env.DB, 'DELETE FROM users WHERE id IN (?, ?)', newbie.id, newer.id)
  })
})

describe("who's watching, and the top videos", () => {
  it('lists every approved user, most active this week first, with their last view', async () => {
    await clear()
    const v = await video()
    await view(v.id, nan, at(1))
    await view(v.id, nan, at(2))
    await view(v.id, kid, at(3))
    await view(v.id, kid, at(20)) // last week's and older don't count this week
    await view(v.id, admin, at(10))
    const { watchers } = await dashboard(env.DB, env.MEDIA, NOW)
    expect(watchers.map((u) => [u.username, u.views_7d, u.last_view_at])).toEqual([
      ['Nan', 2, at(1)],
      ['Oli', 1, at(3)],
      ['Dad', 0, at(10)],
      ['Helper', 0, null],
    ])
    expect(watchers.find((u) => u.username === 'Dad')!.is_admin).toBe(true)
  })

  it('ranks the top 5 videos by views in the last 30 days only', async () => {
    await clear()
    const vids = []
    for (let i = 0; i < 7; i++) vids.push(await video())
    // Video i gets i views this month; video 0 gets 50 views, all older than 30 days.
    for (let i = 1; i < 7; i++) for (let n = 0; n < i; n++) await view(vids[i].id, kid, at(1 + n))
    for (let n = 0; n < 50; n++) await view(vids[0].id, kid, at(31 + n))
    const { top_videos } = await dashboard(env.DB, env.MEDIA, NOW)
    expect(top_videos.map((v) => [v.id, v.views_30d])).toEqual([6, 5, 4, 3, 2].map((i) => [vids[i].id, i]))
  })
})

describe('needs attention', () => {
  it('counts pending users, drafts and leftover uploads (files no video uses)', async () => {
    await clear()
    await video('draft', kid)
    await video('draft', admin)
    await video()
    const used = (await video()).r2_key
    await env.MEDIA.put(used, new Uint8Array(10))
    await env.MEDIA.put('videos/leftover-a.mp4', new Uint8Array(100))
    await env.MEDIA.put('videos/leftover-b.mp4', new Uint8Array(50))
    const { attention } = await dashboard(env.DB, env.MEDIA, NOW)
    expect(attention.drafts).toBe(2)
    expect(attention.leftover_uploads).toEqual({ count: 2, bytes: 150 })
    for (const key of [used, 'videos/leftover-a.mp4', 'videos/leftover-b.mp4']) await env.MEDIA.delete(key)
  })
})

describe('storage', () => {
  it('follows the cursor through every page of a listing', async () => {
    // A bucket that hands out two objects per page.
    const keys = Array.from({ length: 5 }, (_, i) => `thumbnails/t${i}.png`)
    const pages: string[] = []
    const fake = {
      list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
        pages.push(cursor ?? 'start')
        const from = cursor ? Number(cursor) : 0
        const slice = keys.filter((k) => k.startsWith(prefix)).slice(from, from + 2)
        const more = from + 2 < keys.length
        return { objects: slice.map((key) => ({ key, size: 7, uploaded: NOW })), truncated: more, cursor: more ? String(from + 2) : undefined }
      },
    } as unknown as R2Bucket
    const all = await listAllObjects(fake, 'thumbnails/')
    expect(all.map((o) => o.key)).toEqual(keys)
    expect(pages).toEqual(['start', '2', '4'])
  })

  it('totals every object under videos/, thumbnails/ and banners/ across more than one page', async () => {
    await clear()
    // More than R2's 1000 objects per page under thumbnails/.
    const puts = []
    for (let i = 0; i < 1005; i++) puts.push(env.MEDIA.put(`thumbnails/many-${String(i).padStart(4, '0')}.png`, new Uint8Array(3)))
    await Promise.all(puts)
    await env.MEDIA.put('videos/big.mp4', new Uint8Array(4000))
    await env.MEDIA.put('banners/b.png', new Uint8Array(200))
    await env.MEDIA.put('elsewhere/not-counted.bin', new Uint8Array(99999))

    const { storage } = await dashboard(env.DB, env.MEDIA, NOW)
    expect(storage.by_prefix).toEqual({ videos: 4000, thumbnails: 1005 * 3, banners: 200 })
    expect(storage.bytes).toBe(4000 + 3015 + 200)
    expect(storage.objects).toBe(1007)
    expect(storage.free_tier_bytes).toBe(R2_FREE_BYTES)
    expect(storage.rows).toEqual({ users: 4, videos: 0, comments: 0 })
  }, 60_000)
})

describe('access', () => {
  it('is the admin only, never a user with powers', async () => {
    const call = async (as: User) => {
      const user = (await getUserById(env.DB, as.id))!
      return runChain([gate, ...dashboardRoute] as never, { env, data: { email: user.email, user }, request: new Request('https://mytube.pages.dev/api/admin/dashboard') })
    }
    expect((await call(admin)).status).toBe(200)
    expect((await call(helper)).status).toBe(403)
    expect((await call(kid)).status).toBe(403)
  })
})
