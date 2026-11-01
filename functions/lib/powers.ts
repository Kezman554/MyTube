import { all, type User } from './db'

// Named powers (migrations/0005_user_powers.sql). The admin has all of them without rows; anyone
// else has exactly the rows in user_powers, granted and revoked by the admin only.
export const POWERS = ['upload', 'publish_own', 'manage_playlists', 'moderate_comments', 'review_drafts', 'approve_users'] as const
export type Power = (typeof POWERS)[number]

// The admin is the ADMIN_EMAIL account (created by the middleware). No power makes anyone admin.
export function isAdmin(user: { role: string }) {
  return user.role === 'admin'
}

export function isPower(value: unknown): value is Power {
  return typeof value === 'string' && (POWERS as readonly string[]).includes(value)
}

// Read fresh from D1 on every request (the middleware calls this), so a revoked power stops working
// on the user's next request. In POWERS order.
export async function loadPowers(db: D1Database, user: User): Promise<Power[]> {
  if (isAdmin(user)) return [...POWERS]
  const rows = await all<{ power: string }>(db, 'SELECT power FROM user_powers WHERE user_id = ?', user.id)
  const held = new Set(rows.map((r) => r.power))
  return POWERS.filter((p) => held.has(p))
}

// Every non-admin user's powers, keyed by user id, for the admin's user list.
export async function loadAllPowers(db: D1Database): Promise<Map<number, Power[]>> {
  const rows = await all<{ user_id: number; power: string }>(db, 'SELECT user_id, power FROM user_powers')
  const byUser = new Map<number, Set<string>>()
  for (const row of rows) byUser.set(row.user_id, (byUser.get(row.user_id) ?? new Set()).add(row.power))
  return new Map([...byUser].map(([id, held]) => [id, POWERS.filter((p) => held.has(p))]))
}

// Replaces a user's powers with exactly this list, in one batch. Callers refuse the admin first.
export async function setPowers(db: D1Database, userId: number, powers: readonly Power[]) {
  await db.batch([
    db.prepare('DELETE FROM user_powers WHERE user_id = ?').bind(userId),
    ...[...new Set(powers)].map((p) => db.prepare('INSERT INTO user_powers (user_id, power) VALUES (?, ?)').bind(userId, p)),
  ])
}

// The body of PUT /api/admin/users/:id/powers: the full list, each a known power. Repeats are ignored.
export function readPowerList(value: unknown): { powers: Power[] } | { message: string } {
  if (!Array.isArray(value)) return { message: 'Send powers as a list, e.g. { "powers": ["upload"] }.' }
  const unknown = value.find((p) => !isPower(p))
  if (unknown !== undefined) return { message: `Unknown power: ${JSON.stringify(unknown)}. Powers are ${POWERS.join(', ')}.` }
  const held = new Set(value as Power[])
  return { powers: POWERS.filter((p) => held.has(p)) }
}

// A user as the admin's list and the powers endpoint show them: the row plus their powers.
export function userWithPowers(user: User, powers: readonly Power[]) {
  return { ...user, powers: isAdmin(user) ? [...POWERS] : [...powers] }
}
