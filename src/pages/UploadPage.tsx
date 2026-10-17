import { useMe } from '../auth/MeContext'
import { Uploader } from '../upload/Uploader'

// Creators and the admin (the route is guarded in App.tsx). The admin may publish straight away.
export function UploadPage() {
  const { user } = useMe()
  return (
    <div className="page">
      <h1 className="page-title">Upload a video</h1>
      <Uploader canPublish={user.role === 'admin'} />
    </div>
  )
}
