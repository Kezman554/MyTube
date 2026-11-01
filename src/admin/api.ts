// Client side of /api/admin/users, /api/admin/videos and /api/admin/comments. Mirrors functions/api/admin; keep them in step.
import type { Power } from '../auth/powers'
import { request } from '../lib/http'
import type { Video } from '../videos/api'

export type Role = 'admin' | 'viewer'
export type UserStatus = 'pending' | 'approved' | 'removed'

export interface AdminUser {
  id: number
  email: string
  username: string
  role: Role
  status: UserStatus
  can_comment: 0 | 1
  created_at: string
  // Only in the admin's view: what is ticked (every power on the admin's own row), and whether the
  // admin powers apply (off pauses them without unticking).
  powers?: Power[]
  admin_access?: boolean
}

// status needs approve_users, can_comment (mute) moderate_comments.
export interface UserChanges {
  status?: 'approved' | 'removed'
  can_comment?: boolean
}

export const listUsers = () => request('/api/admin/users', {}, (b: { users: AdminUser[] }) => b.users)

export const updateUser = (id: number, changes: UserChanges) =>
  request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }, (b: { user: AdminUser }) => b.user)

// Admin only: on or off for this person's admin powers. Their ticks are kept either way.
export const setAdminAccess = (id: number, on: boolean) =>
  request(`/api/admin/users/${id}/admin-access`, { method: 'PUT', body: JSON.stringify({ admin_access: on }) }, (b: { user: AdminUser }) => b.user)

// Admin only: the user's full list of powers afterwards.
export const setPowers = (id: number, powers: Power[]) =>
  request(`/api/admin/users/${id}/powers`, { method: 'PUT', body: JSON.stringify({ powers }) }, (b: { user: AdminUser }) => b.user)

// The review queue: every draft, oldest first (the admin's own only for the admin).
export interface Draft extends Video {
  uploader: { id: number; username: string }
}

export const listDrafts = () => request('/api/admin/videos', {}, (b: { videos: Draft[] }) => b.videos)

export const publishDraft = (id: number) =>
  request(`/api/admin/videos/${id}/publish`, { method: 'POST' }, (b: { video: Video }) => b.video)

// Deletes the draft's record and files for good.
export const rejectDraft = (id: number) => request(`/api/admin/videos/${id}/reject`, { method: 'POST' }, () => true)

export interface RecentComment {
  id: number
  body: string
  created_at: string
  video: { id: number; title: string }
  user: { id: number; username: string; role: Role; can_comment: boolean }
  // Set on a reply: the top-level comment it belongs to, and its author.
  parent: { id: number; username: string } | null
  // Set on a reply to a reply: whose reply it answered.
  reply_to?: { id: number; username: string } | null
  // On a top-level comment, how many replies a Delete takes with it.
  reply_count: number
  moderation: Moderation
}

// What the caller can do to a comment (moderate_comments): only these controls are shown.
export interface Moderation {
  delete: boolean
  mute: boolean
  muted: boolean
}

// The newest 100 comments on every video, replies included.
export const listRecentComments = () =>
  request('/api/admin/comments', {}, (b: { comments: RecentComment[] }) => b.comments)

export const deleteComment = (id: number) => request(`/api/admin/comments/${id}`, { method: 'DELETE' }, () => true)
