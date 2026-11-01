import { useRef, useState } from 'react'
import { useParams } from 'react-router'
import { can, isAdmin, useMe } from '../auth/MeContext'
import { plurals, timeAgo } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { EnderFace } from '../shell/Pixels'
import { getVideo, publishOwn, recordView, setLiked, type Video } from '../videos/api'
import { CHANNEL_NAME } from './ChannelPage'
import { Comments } from './Comments'
import { LoadFailed, Loading, NotFoundPage } from './Status'
import { useViewCounter } from './useViewCounter'
import './watch.css'

// The watch page: player, title, views and date, channel line, description, comments.
export function WatchPage() {
  const { id = '' } = useParams()
  const [video, reload] = useLoad(`video:${id}`, () => getVideo(id))

  if (video.kind === 'failed' && video.status === 404) return <NotFoundPage />

  return (
    <div className="watch">
      {video.kind === 'ready' ? (
        // Keyed by id, so moving to another video starts a fresh player and view count.
        <Watch key={video.value.id} video={video.value} onPublished={reload} />
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

function Watch({ video, onPublished }: { video: Video; onPublished: () => void }) {
  const me = useMe()
  // Your own draft, with publish_own (the admin publishes from the Drafts tab or here alike).
  const canPublishOwn = video.uploaded_by === me.user.id && (can(me, 'publish_own') || isAdmin(me))
  const player = useRef<HTMLVideoElement>(null)
  const [views, setViews] = useState(video.view_count ?? 0)
  const [failed, setFailed] = useState(false)
  const [liked, setLikedState] = useState(video.liked ?? false)
  const [likes, setLikes] = useState(video.like_count ?? 0)
  const [liking, setLiking] = useState(false)
  const [likeError, setLikeError] = useState(false)

  function toggleLike() {
    setLiking(true)
    setLikeError(false)
    void setLiked(video.id, !liked).then((result) => {
      setLiking(false)
      if (result.ok) {
        setLikedState(result.value.liked)
        setLikes(result.value.like_count)
      } else {
        setLikeError(true)
      }
    })
  }

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
              <span className="chip">Draft: not on the channel yet</span>
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
        {!draft && (
          <div className="watch-actions">
            <button
              type="button"
              className={liked ? 'btn btn-small' : 'btn btn-small btn-quiet'}
              aria-pressed={liked}
              disabled={liking}
              onClick={toggleLike}
            >
              {liked ? 'Liked' : 'Like'} · {likes}
            </button>
            {likeError && (
              <span className="muted" role="alert">
                Couldn't save your like. Try again.
              </span>
            )}
          </div>
        )}
        {draft && canPublishOwn && <PublishOwn videoId={video.id} onPublished={onPublished} />}
        {video.description && <p className="watch-description">{video.description}</p>}
        <Comments videoId={video.id} published={!draft} />
      </div>
    </>
  )
}

// publish_own: put one of your own drafts on the channel without review. Asks first, since everyone
// approved will see it straight away.
function PublishOwn({ videoId, onPublished }: { videoId: number; onPublished: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function publish() {
    setBusy(true)
    setError(null)
    const result = await publishOwn(videoId)
    setBusy(false)
    if (result.ok) onPublished()
    else setError(result.message)
  }

  return (
    <div className="watch-publish">
      {confirming ? (
        <>
          <p className="watch-publish-question">Publish this video? Everyone on MyTube will be able to watch it.</p>
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void publish()}>
            {busy ? 'Publishing…' : 'Yes, publish'}
          </button>
          <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-small" onClick={() => setConfirming(true)}>
          Publish
        </button>
      )}
      {error && (
        <p className="alert-error watch-publish-question" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
