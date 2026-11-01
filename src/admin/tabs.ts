import { can, type ApprovedMe } from '../auth/MeContext'
import type { Power } from '../auth/powers'

export type AdminTab = 'users' | 'drafts' | 'comments' | 'content'

// Each tab and the power that opens it. The admin holds every power, so sees them all.
export const ADMIN_TABS: { tab: AdminTab; to: string; label: string; power: Power }[] = [
  { tab: 'users', to: '/admin', label: 'Users', power: 'approve_users' },
  { tab: 'drafts', to: '/admin/drafts', label: 'Drafts', power: 'review_drafts' },
  { tab: 'comments', to: '/admin/comments', label: 'Comments', power: 'moderate_comments' },
  { tab: 'content', to: '/admin/content', label: 'Content', power: 'manage_playlists' },
]

export function adminTabsFor(me: ApprovedMe) {
  return ADMIN_TABS.filter((t) => can(me, t.power))
}

