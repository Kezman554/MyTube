import { NavLink } from 'react-router'
import { Drafts } from '../admin/Drafts'
import { LeftoverUploads } from '../admin/LeftoverUploads'
import { Playlists } from '../admin/Playlists'
import { RecentComments } from '../admin/RecentComments'
import { Users } from '../admin/Users'

export type AdminTab = 'users' | 'drafts' | 'comments' | 'content'

// Active tab = purple fill, the rest quiet (DESIGN.md: one purple per group), as on the channel page.
const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'btn' : 'btn btn-quiet')

const TABS: { tab: AdminTab; to: string; label: string }[] = [
  { tab: 'users', to: '/admin', label: 'Users' },
  { tab: 'drafts', to: '/admin/drafts', label: 'Drafts' },
  { tab: 'comments', to: '/admin/comments', label: 'Comments' },
  { tab: 'content', to: '/admin/content', label: 'Content' },
]

// The admin only (the route is guarded in App.tsx).
export function AdminPage({ tab }: { tab: AdminTab }) {
  return (
    <div className="page">
      <h1 className="page-title">Admin</h1>
      <nav className="tabs" aria-label="Admin">
        {TABS.map((t) => (
          <NavLink key={t.tab} to={t.to} end className={tabClass}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {tab === 'users' && <Users />}
      {tab === 'drafts' && <Drafts />}
      {tab === 'comments' && <RecentComments />}
      {tab === 'content' && (
        <>
          <LeftoverUploads />
          <Playlists />
        </>
      )}
    </div>
  )
}
