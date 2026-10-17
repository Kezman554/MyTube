// Client side of /api/me and /api/register. Mirrors the shapes in functions/; keep them in step.

export type Status = 'unregistered' | 'pending' | 'approved' | 'removed'

export interface User {
  id: number
  email: string
  username: string
  role: 'admin' | 'creator' | 'viewer'
  status: Exclude<Status, 'unregistered'>
  can_comment: 0 | 1
  created_at: string
}

export interface Me {
  email: string
  user: User | null
  status: Status
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/me', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`GET /api/me failed with ${res.status}`)
  return res.json()
}

export type RegisterResult = { ok: true; me: Me } | { ok: false; message: string }

export async function register(username: string): Promise<RegisterResult> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, me: body as Me }
  return { ok: false, message: body.message ?? 'Something went wrong. Please try again.' }
}
