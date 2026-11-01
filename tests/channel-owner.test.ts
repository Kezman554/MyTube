import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gate } from '../functions/api/_middleware'
import { onRequestPut as putOwnerRoute } from '../functions/api/admin/channel/owner'
import { onRequestDelete as deleteBannerRoute, onRequestGet as getBannerRoute, onRequestPut as putBannerRoute } from '../functions/api/channel/banner'
import { onRequestPut as putBioRoute } from '../functions/api/channel/bio'
import { onRequestGet as getChannelRoute } from '../functions/api/channel/index'
import { onRequestGet as meRoute } from '../functions/api/me'
import { BANNER_MAX_BYTES, BIO_MAX } from '../functions/lib/channel'
import { createUser, getUserById, run, type User } from '../functions/lib/db'
import type { Env } from '../functions/lib/env'
import { setPowers, POWERS } from '../functions/lib/powers'
import { createTestDb, runChain } from './helpers'

let mf: Miniflare
let env: Env
let admin: User, kid: User, nan: User, helper: User, pending: User

beforeAll(async () => {
  const test = await createTestDb('channel-owner-test', { r2: true })
  mf = test.mf
  env = { DB: test.db, MEDIA: test.bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  admin = (await createUser(env.DB, 'admin@example.com', 'Dad', 'admin', 'approved'))!
  kid = (await createUser(env.DB, 'son@example.com', 'Oli', 'viewer', 'approved'))!
  nan = (await createUser(env.DB, 'nan@example.com', 'Nan', 'viewer', 'approved'))!
  helper = (await createUser(env.DB, 'helper@example.com', 'Helper', 'viewer', 'approved'))!
  await setPowers(env.DB, helper.id, [...POWERS])
  pending = (await createUser(env.DB, 'new@example.com', 'Newbie', 'viewer', 'pending'))!
})

afterAll(async () => {
  await mf.dispose()
})

const BASE = 'https://mytube.pages.dev'
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function send(handlers: unknown, as: User, request: Request) {
  const user = (await getUserById(env.DB, as.id))!
  const chain = [gate, ...(Array.isArray(handlers) ? handlers : [handlers])] as never
  return runChain(chain, { env, data: { email: user.email, user }, request })
}
async function json(res: Response) {
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json }
}

const getChannel = async (as: User) => (await json(await send(getChannelRoute, as, new Request(`${BASE}/api/channel`)))).json.channel
const putJson = (handlers: unknown, as: User, path: string, body: unknown) =>
  send(handlers, as, new Request(BASE + path, { method: 'PUT', body: JSON.stringify(body) })).then(json)
const setOwner = (userId: number | null, as: User = admin) => putJson(putOwnerRoute, as, '/api/admin/channel/owner', { user_id: userId })
const setBio = (bio: unknown, as: User = kid) => putJson(putBioRoute, as, '/api/channel/bio', { bio })

// A banner upload as the browser sends it: the file as the body, with its length. contentType is
// whatever the browser claims; the server ignores it.
function bannerRequest(bytes: Uint8Array, opts: { contentType?: string; length?: number | null } = {}) {
  const headers: Record<string, string> = { 'Content-Type': opts.contentType ?? 'image/png' }
  if (opts.length !== null) headers['Content-Length'] = String(opts.length ?? bytes.byteLength)
  return new Request(`${BASE}/api/channel/banner`, { method: 'PUT', body: bytes, headers })
}
const putBanner = (bytes: Uint8Array, as: User = kid, opts = {}) => send(putBannerRoute, as, bannerRequest(bytes, opts)).then(json)
const deleteBanner = (as: User = kid) => send(deleteBannerRoute, as, new Request(`${BASE}/api/channel/banner`, { method: 'DELETE' })).then(json)

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9])
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 1, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 ')])
const GIF = new TextEncoder().encode('GIF89a......')
const objectKeys = async () => (await env.MEDIA.list({ prefix: 'banners/' })).objects.map((o) => o.key)

describe('the owner', () => {
  it('starts with no owner, a blank bio and the built-in banner', async () => {
    expect(await getChannel(nan)).toMatchObject({ owner: null, bio: '', banner_url: null, can_edit: false })
    expect((await getChannel(admin)).can_edit).toBe(true)
  })

  it('is set by the admin, and setting another moves it', async () => {
    const r = await setOwner(kid.id)
    expect(r.status).toBe(200)
    expect(r.json.channel.owner).toEqual({ id: kid.id, username: 'Oli' })
    expect((await getChannel(kid)).can_edit).toBe(true)

    expect((await setOwner(nan.id)).json.channel.owner.username).toBe('Nan')
    expect((await getChannel(kid)).can_edit).toBe(false)
    expect((await getChannel(nan)).can_edit).toBe(true)
    expect((await setBio('Nan was here', kid)).status).toBe(403)
    expect((await setBio('Nan was here', nan)).status).toBe(200)

    expect((await setOwner(null)).json.channel.owner).toBeNull()
    expect((await setOwner(kid.id)).json.channel.owner.id).toBe(kid.id)
  })

  it('must be an approved user, and only the admin sets it', async () => {
    const r = await setOwner(pending.id)
    expect(r.status).toBe(400)
    expect(r.json.error).toBe('invalid_owner')
    expect((await setOwner(99999)).status).toBe(404)
    for (const bad of ['3', 0, -1, 1.5, true]) expect((await setOwner(bad as never)).status, String(bad)).toBe(400)
    // Every power, or being the owner, doesn't let you move the channel.
    expect((await setOwner(helper.id, helper)).status).toBe(403)
    expect((await setOwner(nan.id, kid)).status).toBe(403)
    expect((await getChannel(admin)).owner.id).toBe(kid.id)
  })

  it('loses the channel while removed, without the admin having to move it', async () => {
    await run(env.DB, "UPDATE users SET status = 'removed' WHERE id = ?", kid.id)
    expect((await getChannel(nan)).owner).toBeNull()
    expect((await setBio('Still mine?', kid)).status).toBe(403)
    await run(env.DB, "UPDATE users SET status = 'approved' WHERE id = ?", kid.id)
    expect((await getChannel(nan)).owner.id).toBe(kid.id)
  })

  it('is told by /api/me, as is the admin', async () => {
    const me = async (as: User) => (await json(await send(meRoute, as, new Request(`${BASE}/api/me`)))).json.edits_channel
    expect(await me(kid)).toBe(true)
    expect(await me(admin)).toBe(true)
    expect(await me(nan)).toBe(false)
    expect(await me(helper)).toBe(false)
  })
})

describe('owner-only access', () => {
  it('lets the owner and the admin change the bio and banner, and nobody else, whatever their powers', async () => {
    for (const who of [nan, helper, pending]) {
      expect((await setBio('Not yours', who)).status, who.username).toBe(403)
      expect((await putBanner(PNG, who)).status, who.username).toBe(403)
      expect((await deleteBanner(who)).status, who.username).toBe(403)
    }
    expect((await setBio('From the owner', kid)).status).toBe(200)
    expect((await setBio('From the admin', admin)).status).toBe(200)
    expect((await getChannel(nan)).bio).toBe('From the admin')
  })
})

describe('the bio', () => {
  it('takes up to 500 characters after trimming, counting an emoji as one', async () => {
    expect((await setBio('x'.repeat(BIO_MAX))).status).toBe(200)
    expect((await setBio(`   ${'x'.repeat(BIO_MAX)}  \n `)).status).toBe(200)
    expect((await setBio('🎮'.repeat(BIO_MAX))).status).toBe(200)
    const over = await setBio('x'.repeat(BIO_MAX + 1))
    expect(over.status).toBe(400)
    expect(over.json.error).toBe('invalid_bio')
    expect((await setBio('🎮'.repeat(BIO_MAX + 1))).status).toBe(400)
  })

  it('keeps line breaks, normalised, stores markup as plain text, and can be cleared', async () => {
    expect((await setBio('  I make Minecraft videos.\r\nSubscribe!  ')).json.channel.bio).toBe('I make Minecraft videos.\nSubscribe!')
    expect((await setBio('<b>bold</b> & <script>x</script>')).json.channel.bio).toBe('<b>bold</b> & <script>x</script>')
    expect((await setBio('   ')).json.channel.bio).toBe('')
    for (const bad of [42, null, undefined, ['a']]) expect((await setBio(bad)).status).toBe(400)
  })
})

describe('the banner', () => {
  it('accepts JPG, PNG and WebP by their bytes, whatever the browser calls them', async () => {
    for (const [bytes, type] of [[PNG, 'image/png'], [JPEG, 'image/jpeg'], [WEBP, 'image/webp']] as const) {
      const r = await putBanner(bytes, kid, { contentType: 'application/octet-stream' })
      expect(r.status, type).toBe(200)
      const served = await send(getBannerRoute, nan, new Request(BASE + r.json.channel.banner_url))
      expect(served.headers.get('Content-Type')).toBe(type)
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes)
    }
  })

  it('refuses anything else by its bytes, even when it claims to be an image', async () => {
    for (const bytes of [GIF, new TextEncoder().encode('<svg></svg>'), new Uint8Array([0x89, 0x50, 0x4e, 0x47])]) {
      const r = await putBanner(bytes, kid, { contentType: 'image/png' })
      expect(r.status).toBe(415)
      expect(r.json.error).toBe('unsupported_banner')
    }
    expect((await putBanner(new Uint8Array(0))).status).toBe(400)
  })

  it('refuses over 5 MB, by the declared length before reading and by the real one, and needs a length', async () => {
    expect((await putBanner(PNG, kid, { length: BANNER_MAX_BYTES + 1 })).status).toBe(413)
    const big = new Uint8Array(BANNER_MAX_BYTES + 1)
    big.set(PNG)
    expect((await putBanner(big)).status).toBe(413)
    const exact = new Uint8Array(BANNER_MAX_BYTES)
    exact.set(PNG)
    expect((await putBanner(exact)).status).toBe(200)
    expect((await putBanner(PNG, kid, { length: null })).status).toBe(411)
  })

  it('stores under a random key, deletes the previous banner, and serves a versioned URL cached for a year', async () => {
    const first = (await putBanner(PNG)).json.channel.banner_url as string
    const keysAfterFirst = await objectKeys()
    expect(keysAfterFirst).toHaveLength(1)
    expect(first).toMatch(/^\/api\/channel\/banner\?v=[0-9a-f-]{8}$/)

    const second = (await putBanner(JPEG)).json.channel.banner_url as string
    expect(second).not.toBe(first)
    const keysAfterSecond = await objectKeys()
    expect(keysAfterSecond).toHaveLength(1)
    expect(keysAfterSecond[0]).not.toBe(keysAfterFirst[0])

    const versioned = await send(getBannerRoute, nan, new Request(BASE + second))
    expect(versioned.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
    const plain = await send(getBannerRoute, nan, new Request(`${BASE}/api/channel/banner`))
    expect(plain.headers.get('Cache-Control')).toBe('private, no-cache')
    const etag = plain.headers.get('ETag')!
    expect((await send(getBannerRoute, nan, new Request(`${BASE}/api/channel/banner`, { headers: { 'If-None-Match': etag } }))).status).toBe(304)
    expect((await send(getBannerRoute, pending, new Request(BASE + second))).status).toBe(403)
  })

  it('goes back to the built-in banner on DELETE, removing the file', async () => {
    await putBanner(PNG)
    const r = await deleteBanner()
    expect(r.status).toBe(200)
    expect(r.json.channel.banner_url).toBeNull()
    expect(await objectKeys()).toEqual([])
    expect((await send(getBannerRoute, nan, new Request(`${BASE}/api/channel/banner`))).status).toBe(404)
    expect((await deleteBanner()).status).toBe(200)
  })
})
