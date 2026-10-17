import { readFileSync } from 'node:fs'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { identify as middleware } from '../functions/api/_middleware'
import { onRequestGet as me } from '../functions/api/me'
import type { User } from '../functions/lib/db'
import type { Env, Identity } from '../functions/lib/env'
import { requireApproved, requireRole } from '../functions/lib/guards'

const TEAM = 'mytube-test.cloudflareaccess.com'
const AUD = 'test-aud'
const ADMIN = 'admin@example.com'

let mf: Miniflare
let env: Env
let privateKey: CryptoKey

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'auth-test',
      compatibilityDate: '2026-10-16',
      modules: true,
      script: 'export default { fetch: () => new Response() }',
      d1Databases: ['DB'],
    }),
  )
  const db = (await mf.getD1Database('DB')) as unknown as D1Database
  const schema = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8')
  for (const statement of schema.replace(/^--.*$/gm, '').split(';')) {
    if (statement.trim()) await db.prepare(statement).run()
  }
  env = { DB: db, MEDIA: {} as R2Bucket, ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM, ADMIN_EMAIL: ADMIN }

  // Stand in for the team's certs endpoint.
  const keys = await generateKeyPair('RS256')
  privateKey = keys.privateKey
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  vi.stubGlobal('fetch', async (url: string | URL) => {
    if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] })
    return new Response(null, { status: 404 })
  })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await mf.dispose()
})

function token(email: string, aud = AUD) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://${TEAM}`)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

const NEXT = new Response('next')

// Runs a handler with a minimal Pages context; next() resolves to NEXT.
function call(
  handler: (ctx: never) => Response | Promise<Response>,
  opts: { headers?: Record<string, string>; url?: string; env?: Partial<Env>; data?: Partial<Identity> } = {},
) {
  const data = { ...opts.data } as Identity
  const context = {
    request: new Request(opts.url ?? 'https://mytube.pages.dev/api/me', { headers: opts.headers }),
    env: { ...env, ...opts.env },
    data,
    next: vi.fn(async () => NEXT),
  }
  return { result: Promise.resolve(handler(context as never)), context }
}

describe('middleware', () => {
  it('rejects a missing token with 401', async () => {
    const { result, context } = call(middleware)
    expect((await result).status).toBe(401)
    expect(context.next).not.toHaveBeenCalled()
  })

  it('rejects a token for the wrong audience with 401', async () => {
    const { result, context } = call(middleware, {
      headers: { 'Cf-Access-Jwt-Assertion': await token('someone@example.com', 'other-aud') },
    })
    expect((await result).status).toBe(401)
    expect(context.next).not.toHaveBeenCalled()
  })

  it('rejects a token signed by another key with 401', async () => {
    const other = await generateKeyPair('RS256')
    const forged = await new SignJWT({ email: ADMIN })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime('5m')
      .sign(other.privateKey)
    const { result } = call(middleware, { headers: { 'Cf-Access-Jwt-Assertion': forged } })
    expect((await result).status).toBe(401)
  })

  it('attaches the email and a null user for an unknown email', async () => {
    const { result, context } = call(middleware, {
      headers: { 'Cf-Access-Jwt-Assertion': await token('Stranger@Example.com') },
    })
    expect(await result).toBe(NEXT)
    expect(context.data).toEqual({ email: 'stranger@example.com', user: null })
  })

  it('auto-creates the admin as an approved admin', async () => {
    const { result, context } = call(middleware, { headers: { 'Cf-Access-Jwt-Assertion': await token(ADMIN) } })
    expect(await result).toBe(NEXT)
    expect(context.data.user).toMatchObject({ email: ADMIN, role: 'admin', status: 'approved' })
  })

  it('matches ADMIN_EMAIL ignoring case and stray whitespace, on either side', async () => {
    for (const [configured, inToken] of [
      ['Boss@Example.COM', 'boss@example.com'],
      ['chief@example.com', 'Chief@EXAMPLE.com'],
      [' Head@Example.com\n', 'HEAD@example.com'],
    ]) {
      const { result, context } = call(middleware, {
        headers: { 'Cf-Access-Jwt-Assertion': await token(inToken) },
        env: { ADMIN_EMAIL: configured },
      })
      expect(await result).toBe(NEXT)
      expect(context.data.user, `${configured} vs ${inToken}`).toMatchObject({ email: inToken.toLowerCase(), role: 'admin', status: 'approved' })
    }
  })

  it('does not make a lookalike of ADMIN_EMAIL the admin', async () => {
    for (const lookalike of ['admin@example.co', 'xadmin@example.com', 'admin@example.com.evil.net']) {
      const { result, context } = call(middleware, { headers: { 'Cf-Access-Jwt-Assertion': await token(lookalike) } })
      expect(await result).toBe(NEXT)
      expect(context.data.user).toBeNull()
    }
  })

  it('honours DEV_EMAIL on localhost without a token', async () => {
    const { result, context } = call(middleware, {
      url: 'http://localhost:8788/api/me',
      env: { DEV_EMAIL: 'dev@example.com' },
    })
    expect(await result).toBe(NEXT)
    expect(context.data.email).toBe('dev@example.com')
  })

  it('ignores DEV_EMAIL on any other host', async () => {
    const { result } = call(middleware, { env: { DEV_EMAIL: ADMIN } })
    expect((await result).status).toBe(401)
  })

  it('ignores DEV_EMAIL on hosts that only look local', async () => {
    for (const url of [
      'https://localhost.mytube-672.pages.dev/api/me',
      'https://mytube-672.pages.dev/api/me?host=localhost',
      'https://127.0.0.1.nip.io/api/me',
      'http://localhost.:8788/api/me',
      'http://0.0.0.0:8788/api/me',
      'https://mytube-672.pages.dev/localhost/api/me',
    ]) {
      const { result, context } = call(middleware, { url, env: { DEV_EMAIL: ADMIN } })
      expect((await result).status, url).toBe(401)
      expect(context.next).not.toHaveBeenCalled()
    }
  })

  it('ignores a Host header claiming localhost: the request URL decides', async () => {
    const { result } = call(middleware, { headers: { Host: 'localhost', 'X-Forwarded-Host': 'localhost' }, env: { DEV_EMAIL: ADMIN } })
    expect((await result).status).toBe(401)
  })
})

describe('GET /api/me', () => {
  it('reports unregistered for a null user', async () => {
    const { result } = call(me, { data: { email: 'stranger@example.com', user: null } })
    expect(await (await result).json()).toEqual({ email: 'stranger@example.com', user: null, status: 'unregistered' })
  })
})

describe('guards', () => {
  const user = (role: User['role'], status: User['status']) =>
    ({ id: 1, email: 'u@example.com', username: 'u', role, status, can_comment: 1, created_at: '' }) as User

  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function guard(handler: Parameters<typeof call>[0], u: User | null) {
    const { result, context } = call(handler, { data: { email: 'u@example.com', user: u } })
    const res = await result
    return { res, passed: context.next.mock.calls.length > 0 }
  }

  it('requireApproved rejects unregistered, pending and removed users', async () => {
    for (const [u, error] of [
      [null, 'not_registered'],
      [user('viewer', 'pending'), 'pending'],
      [user('viewer', 'removed'), 'removed'],
    ] as const) {
      const { res, passed } = await guard(requireApproved, u)
      expect(passed).toBe(false)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error })
    }
  })

  it('requireApproved passes approved users', async () => {
    expect((await guard(requireApproved, user('viewer', 'approved'))).passed).toBe(true)
  })

  it('requireRole rejects lower roles and unapproved users', async () => {
    expect((await guard(requireRole('creator'), user('viewer', 'approved'))).res.status).toBe(403)
    expect((await guard(requireRole('admin'), user('creator', 'approved'))).res.status).toBe(403)
    expect((await guard(requireRole('admin'), user('admin', 'pending'))).passed).toBe(false)
    expect((await guard(requireRole('admin'), null)).passed).toBe(false)
  })

  it('requireRole passes the role and roles above it', async () => {
    expect((await guard(requireRole('creator'), user('creator', 'approved'))).passed).toBe(true)
    expect((await guard(requireRole('creator'), user('admin', 'approved'))).passed).toBe(true)
    expect((await guard(requireRole('admin'), user('admin', 'approved'))).passed).toBe(true)
  })
})
