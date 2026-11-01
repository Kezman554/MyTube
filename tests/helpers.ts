import { readdirSync, readFileSync } from 'node:fs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { createUser, type UserStatus } from '../functions/lib/db'
import type { Env, Identity } from '../functions/lib/env'
import { setPowers } from '../functions/lib/powers'

// A Miniflare-backed local D1 with every migration applied, plus a local R2 bucket when asked.
// Dispose mf in afterAll.
// opts.before stops short of that migration file (e.g. '0005'), to test a migration against older data.
export async function createTestDb(name: string, opts: { r2?: boolean; before?: string } = {}) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name,
      compatibilityDate: '2026-10-16',
      modules: true,
      script: 'export default { fetch: () => new Response() }',
      d1Databases: ['DB'],
      r2Buckets: opts.r2 ? ['MEDIA'] : [],
    }),
  )
  const db = (await mf.getD1Database('DB')) as unknown as D1Database
  await applyMigrations(db, (file) => !opts.before || file < opts.before)
  const bucket = opts.r2 ? ((await mf.getR2Bucket('MEDIA')) as unknown as R2Bucket) : ({} as R2Bucket)
  return { mf, db, bucket }
}

export const MIGRATION_FILES = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((f) => f.endsWith('.sql'))
  .sort()

// Applies the migration files that `which` picks, in order, one statement at a time. A trigger body
// (BEGIN ... END) holds semicolons of its own, so it stays one statement.
export async function applyMigrations(db: D1Database, which: (file: string) => boolean) {
  for (const file of MIGRATION_FILES.filter(which)) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/^--.*$/gm, '')
    let pending = ''
    for (const part of sql.split(';')) {
      pending += part
      if (/\bBEGIN\b/i.test(pending) && !/\bEND$/i.test(pending.trim())) {
        pending += ';'
        continue
      }
      if (pending.trim()) await db.prepare(pending).run()
      pending = ''
    }
  }
}

// A viewer holding the upload power: what the creator role used to be.
export async function createCreator(db: D1Database, email: string, username: string, status: UserStatus = 'approved') {
  const user = (await createUser(db, email, username, 'viewer', status))!
  await setPowers(db, user.id, ['upload'])
  return user
}

type Handler = (context: never) => Response | Promise<Response>

export const ROUTE_REACHED = 'route reached'

// Runs Pages handlers in order the way Pages does, each next() calling the following one.
// Past the last handler, next() answers 200 ROUTE_REACHED, standing in for the route itself.
export function runChain(
  handlers: Handler | Handler[],
  opts: { env: Env; data: Partial<Identity>; request: Request; params?: Record<string, string> },
): Promise<Response> {
  const chain = Array.isArray(handlers) ? handlers : [handlers]
  const data = { ...opts.data } as Identity
  const step = async (i: number): Promise<Response> => {
    if (i >= chain.length) return new Response(ROUTE_REACHED)
    const context = { request: opts.request, env: opts.env, data, params: opts.params ?? {}, next: () => step(i + 1) }
    return chain[i](context as never)
  }
  return step(0)
}
