// Client side of /api/admin/users. Mirrors functions/api/admin/users; keep them in step.
import { request } from '../lib/http'

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
