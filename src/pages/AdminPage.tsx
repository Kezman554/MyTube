import { LeftoverUploads } from '../admin/LeftoverUploads'
import { Playlists } from '../admin/Playlists'

// The admin only (the route is guarded in App.tsx). Users, drafts and comments join these later.
export function AdminPage() {
  return (
    <div className="page">
      <h1 className="page-title">Admin</h1>
      <LeftoverUploads />
      <Playlists />
    </div>
  )
}
