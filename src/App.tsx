import { LeftoverUploads } from './admin/LeftoverUploads'
import { AuthGate } from './auth/AuthGate'
import { canUpload, useMe } from './auth/MeContext'
import { Uploader } from './upload/Uploader'
import './App.css'

function Home() {
  const { user } = useMe()
  const isAdmin = user.role === 'admin'
  return (
    <main className="placeholder">
      <h1 className="wordmark">MyTube</h1>
      {isAdmin && <LeftoverUploads />}
      {canUpload(user) && <Uploader canPublish={isAdmin} />}
    </main>
  )
}

function App() {
  return (
    <AuthGate>
      <Home />
    </AuthGate>
  )
}

export default App
