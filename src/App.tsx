import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthGate } from './auth/AuthGate'
import { can, isAdmin, useMe, type ApprovedMe } from './auth/MeContext'
import { ADMIN_TABS, adminTabsFor, opens } from './admin/tabs'
import { AdminPage } from './pages/AdminPage'
import { ChannelPage } from './pages/ChannelPage'
import { ChannelSettingsPage } from './pages/ChannelSettingsPage'
import { StudioPage } from './pages/StudioPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { NotFoundPage } from './pages/Status'
import { UploadPage } from './pages/UploadPage'
import { WatchPage } from './pages/WatchPage'
import { Shell } from './shell/Shell'

// A page only some people may open. Everyone else gets Not found, so it doesn't reveal it exists.
// The API enforces the same rules; this only keeps people off pages that would fail for them.
function Only({ allow, children }: { allow: (me: ApprovedMe) => boolean; children: ReactNode }) {
  return allow(useMe()) ? children : <NotFoundPage />
}

// /admin is the admin's Dashboard. Anyone else with a tab's power is taken to their first tab; with
// none of them, it is Not found.
function AdminHome() {
  const me = useMe()
  if (isAdmin(me)) return <AdminPage tab="dashboard" />
  const first = adminTabsFor(me)[0]
  return first ? <Navigate to={first.to} replace /> : <NotFoundPage />
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
                <Only allow={(me) => can(me, 'upload')}>
                  <UploadPage />
                </Only>
              }
            />
            <Route
              path="channel/edit"
              element={
                <Only allow={(me) => me.edits_channel}>
                  <ChannelSettingsPage />
                </Only>
              }
            />
            <Route
              path="studio"
              element={
                <Only allow={(me) => me.edits_channel}>
                  <StudioPage />
                </Only>
              }
            />
            <Route path="admin" element={<AdminHome />} />
            {ADMIN_TABS.filter((t) => t.tab !== 'dashboard').map((t) => (
              <Route
                key={t.tab}
                path={t.to.slice(1)}
                element={
                  <Only allow={(me) => opens(me, t.power)}>
                    <AdminPage tab={t.tab} />
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
