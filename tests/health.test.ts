import { describe, expect, it } from 'vitest'
import { onRequestGet } from '../functions/api/health'

describe('GET /api/health', () => {
  it('returns { ok: true }', async () => {
    const res = await (onRequestGet as () => Response)()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
