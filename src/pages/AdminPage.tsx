import { NavLink } from 'react-router'
import { Drafts } from '../admin/Drafts'
import { LeftoverUploads } from '../admin/LeftoverUploads'
import { Playlists } from '../admin/Playlists'
import { RecentComments } from '../admin/RecentComments'
import { Users } from '../admin/Users'
import { adminTabsFor, type AdminTab } from '../admin/tabs'
import { isAdmin, useMe } from '../auth/MeContext'

// Active tab = purple fill, the rest quiet (DESIGN.md: one purple per group), as on the channel page.
const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'btn' : 'btn btn-quiet')

// The admin, and anyone holding a power one of the tabs needs (routes are guarded in App.tsx).
export function AdminPage({ tab }: { tab: AdminTab }) {
  const me = useMe()
  return (
    <div className="page">
      <h1 className="page-title">Admin</h1>
      <nav className="tabs" aria-label="Admin">
        {adminTabsFor(me).map((t) => (
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
          {/* Leftover uploads stay with the admin: no power covers them. */}
          {isAdmin(me) && <LeftoverUploads />}
          <Playlists />
        </>
      )}
    </div>
  )
}
