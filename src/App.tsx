import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthGate } from './auth/AuthGate'
import { canUpload, useMe } from './auth/MeContext'
import type { User } from './auth/api'
import { AdminPage } from './pages/AdminPage'
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
            <Route
              path="admin"
              element={
                <Only allow={(user) => user.role === 'admin'}>
                  <AdminPage tab="users" />
                </Only>
              }
            />
            <Route
              path="admin/content"
              element={
                <Only allow={(user) => user.role === 'admin'}>
                  <AdminPage tab="content" />
                </Only>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  )
}

export default App
