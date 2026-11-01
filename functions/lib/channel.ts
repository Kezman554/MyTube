import { first, getChannelOwnerId, run, type User } from './db'
import type { ApiFunction } from './env'
import { requireApproved } from './guards'
import { imageVersion } from './images'
import { isAdmin } from './powers'
import { MiB } from './uploads'

// The channel (migrations/0007_channel.sql): one row, owned by one approved user.
export const BIO_MAX = 500
export const BANNER_MAX_BYTES = 5 * MiB

interface ChannelRow {
  owner_user_id: number | null
  bio: string
  banner_key: string | null
  updated_at: string
  owner_username: string | null
  owner_status: string | null
}

export function getChannel(db: D1Database) {
  return first<ChannelRow>(
    db,
    `SELECT channel.owner_user_id, channel.bio, channel.banner_key, channel.updated_at,
       users.username AS owner_username, users.status AS owner_status
     FROM channel LEFT JOIN users ON users.id = channel.owner_user_id WHERE channel.id = 1`,
  ) as Promise<ChannelRow>
}

// The owner only counts while approved: a removed owner has no say until approved again.
function approvedOwner(row: ChannelRow) {
  return row.owner_user_id !== null && row.owner_status === 'approved' ? row.owner_user_id : null
}

// What the API says about the channel. banner_url is null for the built-in banner; can_edit tells the
// caller whether Channel settings is theirs to open.
export function channelJson(row: ChannelRow, caller: User) {
  const owner = approvedOwner(row)
  return {
    owner: owner === null ? null : { id: owner, username: row.owner_username! },
    bio: row.bio,
    banner_url: row.banner_key ? `/api/channel/banner?v=${imageVersion(row.banner_key)}` : null,
    can_edit: isAdmin(caller) || owner === caller.id,
    updated_at: row.updated_at,
  }
}

// Whether this user may change the bio and banner: the admin, or the approved owner.
export async function canEditChannel(db: D1Database, user: User) {
  if (isAdmin(user)) return true
  return (await getChannelOwnerId(db)) === user.id
}

// The owner (or the admin), approved. Everyone else gets 403 before the handler runs.
export const requireChannelEditor: ApiFunction = async (context) => {
  const { user } = context.data
  if (!user || user.status !== 'approved') return requireApproved(context)
  if (!(await canEditChannel(context.env.DB, user))) return Response.json({ error: 'forbidden' }, { status: 403 })
  return context.next()
}

// Plain text: line breaks normalised and kept, ends trimmed, up to BIO_MAX characters (code points, so
// an emoji counts as one). Empty clears it. Never rendered as markup: the page shows it as text.
export function readBio(value: unknown): { bio: string } | { message: string } {
  if (typeof value !== 'string') return { message: 'Send the bio as text.' }
  const bio = value.replace(/\r\n?/g, '\n').trim()
  if (Array.from(bio).length > BIO_MAX) return { message: `Your bio can be up to ${BIO_MAX} characters.` }
  return { bio }
}

export function setBio(db: D1Database, bio: string) {
  return run(db, "UPDATE channel SET bio = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 1", bio)
}

// Sets the banner key (null for the built-in banner) and returns the one it replaced.
export async function setBannerKey(db: D1Database, key: string | null) {
  const before = await first<{ banner_key: string | null }>(db, 'SELECT banner_key FROM channel WHERE id = 1')
  await run(db, "UPDATE channel SET banner_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 1", key)
  return before?.banner_key ?? null
}

export function setOwner(db: D1Database, userId: number | null) {
  return run(db, "UPDATE channel SET owner_user_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 1", userId)
}
