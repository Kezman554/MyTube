import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { commentAge, plurals, timeAgo } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { getStudio, markSeen, type Count, type Studio, type StudioComment, type StudioVideo } from '../studio/api'
import { Thumb } from './ChannelPage'
import { LoadFailed, Loading } from './Status'
import './studio.css'

// How long the new figures stay on screen, with the tab visible, before the visit counts as seen.
// A quick reload or a tab opened in the background doesn't use the news up.
const SEEN_AFTER_MS = 3000

type Sort = 'newest' | 'views' | 'likes'
const SORTS: { sort: Sort; label: string }[] = [
  { sort: 'newest', label: 'Newest' },
  { sort: 'views', label: 'Most viewed' },
  { sort: 'likes', label: 'Most liked' },
]

// The Studio, for the channel's owner and the admin (the route is guarded in App.tsx): how the channel
// is doing, and what's new since your last visit. Big totals first, then videos and comments: tabs on a
// phone or tablet, side by side on a laptop.
export function StudioPage() {
  const [studio, reload] = useLoad('studio', getStudio)
  return (
    <div className="page page-wide studio">
      <h1 className="page-title">Studio</h1>
      {studio.kind === 'loading' && <Loading what="your Studio" />}
      {studio.kind === 'failed' && <LoadFailed message={studio.message} onRetry={reload} />}
      {studio.kind === 'ready' && <StudioBody studio={studio.value} />}
    </div>
  )
}

function StudioBody({ studio }: { studio: Studio }) {
  const [pane, setPane] = useState<'videos' | 'comments'>('videos')
  useMarkSeen(studio.as_of)
  const { totals } = studio
  const newComments = studio.comments.filter((c) => c.new).length

  return (
    <>
      <p className="muted studio-since">
        {studio.since ? `What's new since your last visit, ${timeAgo(studio.since)}.` : 'Your first visit, so everything counts as new.'}
      </p>
      <ul className="studio-totals" aria-label="Channel totals">
        <Total label="Videos" count={totals.videos} />
        <Total label="Views" count={totals.views} />
        <Total label="Likes" count={totals.likes} />
        <Total label="Comments" count={totals.comments} />
      </ul>

      {/* Below 1024px only one pane shows at a time; these buttons pick it. Wider, both show. */}
      <div className="tabs studio-tabs" role="group" aria-label="Show">
        <button type="button" className={pane === 'videos' ? 'btn' : 'btn btn-quiet'} aria-pressed={pane === 'videos'} onClick={() => setPane('videos')}>
          Videos
        </button>
        <button type="button" className={pane === 'comments' ? 'btn' : 'btn btn-quiet'} aria-pressed={pane === 'comments'} onClick={() => setPane('comments')}>
          Comments{newComments > 0 ? ` (${newComments} new)` : ''}
        </button>
      </div>

      <div className="studio-panes">
        <VideoPane videos={studio.videos} hidden={pane !== 'videos'} />
        <CommentPane comments={studio.comments} hidden={pane !== 'comments'} />
      </div>
    </>
  )
}

// Marks the visit once the new figures have been on screen for a few seconds with the tab visible.
// Sends the as_of of the read that was shown, so anything that arrived since stays new next time.
function useMarkSeen(asOf: string) {
  useEffect(() => {
    let timer: number | undefined
    let done = false
    const start = () => {
      if (done || timer !== undefined || document.visibilityState !== 'visible') return
      timer = window.setTimeout(() => {
        done = true
        void markSeen(asOf)
      }, SEEN_AFTER_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [asOf])
}

function NewBadge({ n, label }: { n: number; label?: string }) {
  if (n <= 0) return null
  return <span className="new-badge">+{n} new{label ? ` ${label}` : ''}</span>
}

function Total({ label, count }: { label: string; count: Count }) {
  return (
    <li className={count.new > 0 ? 'studio-total studio-total-new' : 'studio-total'}>
      <span className="studio-total-number">{count.total.toLocaleString()}</span>
      <span className="studio-total-label">{label}</span>
      <NewBadge n={count.new} />
    </li>
  )
}

const newestFirst = (v: StudioVideo) => v.published_at ?? v.created_at

function VideoPane({ videos, hidden }: { videos: StudioVideo[]; hidden: boolean }) {
  const [sort, setSort] = useState<Sort>('newest')
  const sorted = useMemo(() => {
    const list = [...videos]
    if (sort === 'views') list.sort((a, b) => b.views.total - a.views.total || newestFirst(b).localeCompare(newestFirst(a)))
    else if (sort === 'likes') list.sort((a, b) => b.likes.total - a.likes.total || newestFirst(b).localeCompare(newestFirst(a)))
    else list.sort((a, b) => newestFirst(b).localeCompare(newestFirst(a)))
    return list
  }, [videos, sort])

  return (
    <section className={hidden ? 'studio-pane studio-pane-hidden' : 'studio-pane'} aria-labelledby="studio-videos">
      <h2 id="studio-videos" className="studio-pane-title">
        Videos
      </h2>
      {videos.length === 0 ? (
        <p className="muted">No videos yet. Upload one and it will show up here.</p>
      ) : (
        <>
          <div className="studio-sort" role="group" aria-label="Sort videos by">
            {SORTS.map((s) => (
              <button
                key={s.sort}
                type="button"
                className={sort === s.sort ? 'btn btn-small' : 'btn btn-quiet btn-small'}
                aria-pressed={sort === s.sort}
                onClick={() => setSort(s.sort)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ul className="studio-videos">
            {sorted.map((video) => (
              <VideoRow key={video.id} video={video} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function VideoRow({ video }: { video: StudioVideo }) {
  const hasNew = video.views.new + video.likes.new + video.comments.new > 0
  return (
    <li className={hasNew ? 'studio-video studio-video-new' : 'studio-video'}>
      <Link to={`/watch/${video.id}`} className="studio-video-thumb" tabIndex={-1} aria-hidden="true">
        <Thumb url={video.thumbnail_url} />
      </Link>
      <div className="studio-video-main">
        <Link to={`/watch/${video.id}`} className="studio-video-title">
          {video.title}
        </Link>
        <p className="studio-video-when">
          {video.status === 'draft' ? <span className="chip">Waiting for review</span> : `Published ${timeAgo(video.published_at!)}`}
        </p>
        {video.status === 'published' && (
          <ul className="studio-stats">
            <Stat count={video.views} one="view" />
            <Stat count={video.likes} one="like" />
            <Stat count={video.comments} one="comment" />
          </ul>
        )}
      </div>
    </li>
  )
}

function Stat({ count, one }: { count: Count; one: string }) {
  return (
    <li className="studio-stat">
      {plurals(count.total, one)}
      <NewBadge n={count.new} />
    </li>
  )
}

function CommentPane({ comments, hidden }: { comments: StudioComment[]; hidden: boolean }) {
  return (
    <section className={hidden ? 'studio-pane studio-pane-hidden' : 'studio-pane'} aria-labelledby="studio-comments">
      <h2 id="studio-comments" className="studio-pane-title">
        Comments
      </h2>
      {comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="studio-comments">
          {comments.map((c) => (
            <li key={c.id} className={c.new ? 'studio-comment studio-comment-new' : 'studio-comment'}>
              <p className="studio-comment-meta">
                <span className="studio-comment-name">{c.user.username}</span>{' '}
                <span className="muted-inline">
                  · {commentAge(c.created_at)} · {c.is_reply ? 'Reply on' : 'On'} <Link to={`/watch/${c.video.id}`}>{c.video.title}</Link>
                </span>
                {c.new && <span className="new-badge">New</span>}
              </p>
              <p className="studio-comment-body">{c.body}</p>
              <Link to={c.link} className="studio-comment-link">
                See it on the video
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
