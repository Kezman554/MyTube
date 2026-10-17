// Client side of /api/admin/users, /api/admin/videos and /api/admin/comments. Mirrors functions/api/admin; keep them in step.
import { request } from '../lib/http'
import type { Video } from '../videos/api'

export type Role = 'admin' | 'creator' | 'viewer'
export type UserStatus = 'pending' | 'approved' | 'removed'

export interface AdminUser {
  id: number
  email: string
  username: string
  role: Role
  status: UserStatus
  can_comment: 0 | 1
  created_at: string
}

export interface UserChanges {
  status?: 'approved' | 'removed'
  role?: 'creator' | 'viewer'
  can_comment?: boolean
}

export const listUsers = () => request('/api/admin/users', {}, (b: { users: AdminUser[] }) => b.users)

export const updateUser = (id: number, changes: UserChanges) =>
  request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }, (b: { user: AdminUser }) => b.user)

// The review queue: every creator draft, oldest first.
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
}

// The newest 100 comments on every video.
export const listRecentComments = () =>
  request('/api/admin/comments', {}, (b: { comments: RecentComment[] }) => b.comments)

export const deleteComment = (id: number) => request(`/api/admin/comments/${id}`, { method: 'DELETE' }, () => true)
