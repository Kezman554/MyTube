import { readdirSync, readFileSync } from 'node:fs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import type { Env, Identity } from '../functions/lib/env'

// A Miniflare-backed local D1 with every migration applied, plus a local R2 bucket when asked.
// Dispose mf in afterAll.
export async function createTestDb(name: string, opts: { r2?: boolean } = {}) {
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
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8')
    for (const statement of sql.replace(/^--.*$/gm, '').split(';')) {
      if (statement.trim()) await db.prepare(statement).run()
    }
  }
  const bucket = opts.r2 ? ((await mf.getR2Bucket('MEDIA')) as unknown as R2Bucket) : ({} as R2Bucket)
  return { mf, db, bucket }
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
