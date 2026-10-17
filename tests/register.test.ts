import { readFileSync } from 'node:fs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { onRequestPost as register } from '../functions/api/register'
import { createUser, getUserByEmail, type User } from '../functions/lib/db'
import type { Env, Identity } from '../functions/lib/env'
import { checkUsername } from '../functions/lib/username'

let mf: Miniflare
let env: Env

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'register-test',
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
  env = { DB: db, MEDIA: {} as R2Bucket, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team', ADMIN_EMAIL: 'admin@example.com' }
  await createUser(db, 'taken@example.com', 'Steve')
})

afterAll(async () => {
  await mf.dispose()
})

// Posts a body to the route as a caller with this email and (possibly null) user row.
async function post(email: string, body: unknown, user: User | null = null) {
  const data: Identity = { email, user }
  const request = new Request('https://mytube.pages.dev/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const res = await register({ request, env, data } as never)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

describe('checkUsername', () => {
  it('accepts letters, numbers, underscores and hyphens and trims spaces', () => {
    expect(checkUsername('  Ender_Fan-99 ')).toEqual({ ok: true, username: 'Ender_Fan-99' })
  })

  it('rejects the wrong length, characters or type', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'has space', 'emoji🙂', 'dot.name', '', undefined, 42]) {
      expect(checkUsername(bad).ok).toBe(false)
    }
  })
})

describe('POST /api/register', () => {
  it('creates a pending viewer with the chosen username', async () => {
    const { status, json } = await post('new@example.com', { username: 'Grandma_J' })
    expect(status).toBe(201)
    expect(json.status).toBe('pending')
    expect(json.user).toMatchObject({ email: 'new@example.com', username: 'Grandma_J', role: 'viewer', status: 'pending' })
    expect(await getUserByEmail(env.DB, 'new@example.com')).toMatchObject({ username: 'Grandma_J' })
  })

  it('rejects an invalid username with 400 and a message', async () => {
    const { status, json } = await post('bad@example.com', { username: 'no' })
    expect(status).toBe(400)
    expect(json.error).toBe('invalid_username')
    expect(json.message).toBeTruthy()
    expect(await getUserByEmail(env.DB, 'bad@example.com')).toBeNull()
  })

  it('rejects a malformed body with 400', async () => {
    expect((await post('bad@example.com', '{not json')).status).toBe(400)
  })

  it('rejects a username that is taken, ignoring case, with 409', async () => {
    const { status, json } = await post('other@example.com', { username: 'sTEVE' })
    expect(status).toBe(409)
    expect(json.error).toBe('username_taken')
  })

  it('rejects a caller who already has a user row with 409', async () => {
    const existing = await getUserByEmail(env.DB, 'taken@example.com')
    const { status, json } = await post('taken@example.com', { username: 'Another' }, existing)
    expect(status).toBe(409)
    expect(json.error).toBe('already_registered')
  })

  it('reports already_registered if the email was registered after the middleware ran', async () => {
    const { status, json } = await post('taken@example.com', { username: 'Fresh_Name' })
    expect(status).toBe(409)
    expect(json.error).toBe('already_registered')
  })
})
