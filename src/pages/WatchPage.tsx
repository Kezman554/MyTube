import { useRef, useState } from 'react'
import { useParams } from 'react-router'
import { plurals, timeAgo } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { EnderFace } from '../shell/Pixels'
import { getVideo, recordView, type Video } from '../videos/api'
import { CHANNEL_NAME } from './ChannelPage'
import { LoadFailed, Loading, NotFoundPage } from './Status'
import { useViewCounter } from './useViewCounter'
import './watch.css'

// The watch page: player, title, views and date, channel line, description.
export function WatchPage() {
  const { id = '' } = useParams()
  const [video, reload] = useLoad(`video:${id}`, () => getVideo(id))

  if (video.kind === 'failed' && video.status === 404) return <NotFoundPage />

  return (
    <div className="watch">
      {video.kind === 'ready' ? (
        // Keyed by id, so moving to another video starts a fresh player and view count.
        <Watch key={video.value.id} video={video.value} />
      ) : (
        <>
          <div className="player" />
          <div className="page watch-body">
            {video.kind === 'loading' && <Loading what="the video" />}
            {video.kind === 'failed' && <LoadFailed message={video.message} onRetry={reload} />}
          </div>
        </>
      )}
    </div>
  )
}

function Watch({ video }: { video: Video }) {
  const player = useRef<HTMLVideoElement>(null)
  const [views, setViews] = useState(video.view_count ?? 0)
  const [failed, setFailed] = useState(false)

  useViewCounter(player, String(video.id), () => {
    void recordView(video.id).then((result) => {
      if (result.ok) setViews(result.value.view_count)
    })
  })

  const draft = video.status === 'draft'
  return (
    <>
      <div className="player">
        <video
          ref={player}
          className="player-video"
          src={`/api/stream/${video.id}`}
          poster={video.thumbnail_url ?? undefined}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        >
          Your browser can't play this video.
        </video>
        {failed && (
          <p className="player-note" role="alert">
            This video couldn't be played. Try reloading the page.
          </p>
        )}
      </div>
      <div className="page watch-body">
        <div className="stack-tight">
          <h1 className="watch-title">{video.title}</h1>
          <p className="muted">
            {draft ? (
              <span className="chip">Draft: only you and the admin can see this</span>
            ) : (
              `${plurals(views, 'view')} · ${timeAgo(video.published_at ?? video.created_at)}`
            )}
          </p>
        </div>
        <div className="watch-channel">
          <span className="watch-avatar">
            <EnderFace size={32} />
          </span>
          <span className="watch-channel-name">{CHANNEL_NAME}</span>
        </div>
        {video.description && <p className="watch-description">{video.description}</p>}
      </div>
    </>
  )
}
