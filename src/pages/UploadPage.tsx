import { can, useMe } from '../auth/MeContext'
import { Uploader } from '../upload/Uploader'

// Anyone with the upload power (the route is guarded in App.tsx). With publish_own (or review_drafts,
// or as the admin) they may publish straight away; the server checks the same.
export function UploadPage() {
  const me = useMe()
  return (
    <div className="page">
      <h1 className="page-title">Upload a video</h1>
      <Uploader canPublish={can(me, 'publish_own') || can(me, 'review_drafts')} />
    </div>
  )
}
