import { can, isAdmin, type ApprovedMe } from '../auth/MeContext'
import type { Power } from '../auth/powers'

export type AdminTab = 'dashboard' | 'users' | 'drafts' | 'comments' | 'content'

// Each tab and what opens it: a power (the admin holds them all), or the admin alone. The Dashboard
// is the admin's only, never a helper's, whatever their powers.
export const ADMIN_TABS: { tab: AdminTab; to: string; label: string; power: Power | 'admin' }[] = [
  { tab: 'dashboard', to: '/admin', label: 'Dashboard', power: 'admin' },
  { tab: 'users', to: '/admin/users', label: 'Users', power: 'approve_users' },
  { tab: 'drafts', to: '/admin/drafts', label: 'Drafts', power: 'review_drafts' },
  { tab: 'comments', to: '/admin/comments', label: 'Comments', power: 'moderate_comments' },
  { tab: 'content', to: '/admin/content', label: 'Content', power: 'manage_playlists' },
]

export function opens(me: ApprovedMe, power: Power | 'admin') {
  return power === 'admin' ? isAdmin(me) : can(me, power)
}

export function adminTabsFor(me: ApprovedMe) {
  return ADMIN_TABS.filter((t) => opens(me, t.power))
}
