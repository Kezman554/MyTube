// Typed D1 access. Row types mirror migrations/; keep them in step.

export type Role = 'admin' | 'creator' | 'viewer'
export type UserStatus = 'pending' | 'approved' | 'removed'
export type VideoStatus = 'draft' | 'published'

export interface User {
  id: number
  email: string
  username: string
  role: Role
  status: UserStatus
  can_comment: 0 | 1
  created_at: string
}

export interface Video {
  id: number
  title: string
  description: string
  r2_key: string
  thumbnail_key: string | null
  status: VideoStatus
  uploaded_by: number
  created_at: string
  published_at: string | null
}

export interface Playlist {
  id: number
  title: string
  description: string
  created_at: string
}

export interface PlaylistVideo {
  playlist_id: number
  video_id: number
  position: number
}

export interface Like {
  user_id: number
  video_id: number
  created_at: string
}

export interface Comment {
  id: number
  video_id: number
  user_id: number
  body: string
  created_at: string
}

export interface View {
  id: number
  video_id: number
  user_id: number
  created_at: string
}

type Param = string | number | null

// Generic helpers: always bind parameters, never interpolate into SQL.

export async function first<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>()
}

export async function all<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>()
  return results
}

export async function run(db: D1Database, sql: string, ...params: Param[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run()
}

// Users

export function getUserByEmail(db: D1Database, email: string) {
  return first<User>(db, 'SELECT * FROM users WHERE email = ?', email)
}

export function getUserById(db: D1Database, id: number) {
  return first<User>(db, 'SELECT * FROM users WHERE id = ?', id)
}

export function createUser(
  db: D1Database,
  email: string,
  username: string,
  role: Role = 'viewer',
  status: UserStatus = 'pending',
) {
  return first<User>(
    db,
    'INSERT INTO users (email, username, role, status) VALUES (?, ?, ?, ?) RETURNING *',
    email,
    username,
    role,
    status,
  )
}

export function listUsers(db: D1Database, status?: UserStatus) {
  return status
    ? all<User>(db, 'SELECT * FROM users WHERE status = ? ORDER BY created_at, id', status)
    : all<User>(db, 'SELECT * FROM users ORDER BY created_at, id')
}

export type UserChanges = Partial<Pick<User, 'status' | 'role' | 'can_comment'>>

// Column names come from this fixed list, never from the caller.
const USER_COLUMNS = ['status', 'role', 'can_comment'] as const

export function updateUser(db: D1Database, id: number, changes: UserChanges) {
  const columns = USER_COLUMNS.filter((column) => changes[column] !== undefined)
  if (columns.length === 0) return getUserById(db, id)
  return first<User>(
    db,
    `UPDATE users SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? RETURNING *`,
    ...columns.map((column) => changes[column]!),
    id,
  )
}

// Videos

export function getVideo(db: D1Database, id: number) {
  return first<Video>(db, 'SELECT * FROM videos WHERE id = ?', id)
}

export function listPublishedVideos(db: D1Database) {
  return all<Video>(db, "SELECT * FROM videos WHERE status = 'published' ORDER BY published_at DESC")
}
