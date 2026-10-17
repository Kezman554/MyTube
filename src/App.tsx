import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthGate } from './auth/AuthGate'
import { canUpload, useMe } from './auth/MeContext'
import type { User } from './auth/api'
import { AdminPage, type AdminTab } from './pages/AdminPage'
import { ChannelPage } from './pages/ChannelPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { NotFoundPage } from './pages/Status'
import { UploadPage } from './pages/UploadPage'
import { WatchPage } from './pages/WatchPage'
import { Shell } from './shell/Shell'

// A page only some roles may open. Everyone else gets Not found, so it doesn't reveal it exists.
// The API enforces the same rules; this only keeps people off pages that would fail for them.
function Only({ allow, children }: { allow: (user: User) => boolean; children: ReactNode }) {
  const { user } = useMe()
  return allow(user) ? children : <NotFoundPage />
}

const ADMIN_ROUTES: [string, AdminTab][] = [
  ['admin', 'users'],
  ['admin/drafts', 'drafts'],
  ['admin/comments', 'comments'],
  ['admin/content', 'content'],
]

// AuthGate first (register, pending and removed screens), then the routes for approved users.
function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<ChannelPage tab="videos" />} />
            <Route path="watch/:id" element={<WatchPage />} />
            <Route path="playlists" element={<ChannelPage tab="playlists" />} />
            <Route path="playlists/:id" element={<PlaylistPage />} />
            <Route
              path="upload"
              element={
                <Only allow={canUpload}>
                  <UploadPage />
                </Only>
              }
            />
            {ADMIN_ROUTES.map(([path, tab]) => (
              <Route
                key={path}
                path={path}
                element={
                  <Only allow={(user) => user.role === 'admin'}>
                    <AdminPage tab={tab} />
                  </Only>
                }
              />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  )
}

export default App
