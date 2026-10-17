import { useParams } from 'react-router'
import { timeAgo } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { EnderFace } from '../shell/Pixels'
import { getVideo } from '../videos/api'
import { CHANNEL_NAME } from './ChannelPage'
import { LoadFailed, Loading, NotFoundPage } from './Status'
import './watch.css'

// The watch page: player, title, channel line, description. Playback, likes and comments arrive in
// later sessions; until then the player area shows the thumbnail.
export function WatchPage() {
  const { id = '' } = useParams()
  const [video, reload] = useLoad(`video:${id}`, () => getVideo(id))

  if (video.kind === 'failed' && video.status === 404) return <NotFoundPage />

  return (
    <div className="watch">
      <div className="player">
        {video.kind === 'ready' && video.value.thumbnail_url && <img src={video.value.thumbnail_url} alt="" />}
        <p className="player-note">Playback isn't available yet.</p>
      </div>
      <div className="page watch-body">
        {video.kind === 'loading' && <Loading what="the video" />}
        {video.kind === 'failed' && <LoadFailed message={video.message} onRetry={reload} />}
        {video.kind === 'ready' && (
          <>
            <div className="stack-tight">
              <h1 className="watch-title">{video.value.title}</h1>
              <p className="muted">
                {video.value.status === 'draft' ? (
                  <span className="chip">Draft: only you and the admin can see this</span>
                ) : (
                  timeAgo(video.value.published_at ?? video.value.created_at)
                )}
              </p>
            </div>
            <div className="watch-channel">
              <span className="watch-avatar">
                <EnderFace size={32} />
              </span>
              <span className="watch-channel-name">{CHANNEL_NAME}</span>
            </div>
            {video.value.description && <p className="watch-description">{video.value.description}</p>}
          </>
        )}
      </div>
    </div>
  )
}
