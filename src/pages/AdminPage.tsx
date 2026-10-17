import { NavLink } from 'react-router'
import { LeftoverUploads } from '../admin/LeftoverUploads'
import { Playlists } from '../admin/Playlists'
import { Users } from '../admin/Users'

// Active tab = purple fill, the rest quiet (DESIGN.md: one purple per group), as on the channel page.
const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'btn' : 'btn btn-quiet')

// The admin only (the route is guarded in App.tsx). Drafts and comments join these later.
export function AdminPage({ tab }: { tab: 'users' | 'content' }) {
  return (
    <div className="page">
      <h1 className="page-title">Admin</h1>
      <nav className="tabs" aria-label="Admin">
        <NavLink to="/admin" end className={tabClass}>
          Users
        </NavLink>
        <NavLink to="/admin/content" end className={tabClass}>
          Content
        </NavLink>
      </nav>
      {tab === 'users' ? (
        <Users />
      ) : (
        <>
          <LeftoverUploads />
          <Playlists />
        </>
      )}
    </div>
  )
}
