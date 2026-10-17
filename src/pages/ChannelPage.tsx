import { Link, NavLink } from 'react-router'
import { plurals, timeAgo } from '../lib/format'
import { useLoad, type Loaded } from '../lib/useLoad'
import { EnderFace } from '../shell/Pixels'
import { listPlaylists, listVideos, type PlaylistSummary, type Video } from '../videos/api'
import { LoadFailed, Loading } from './Status'
import './channel.css'

// The channel's name is always written this way (DESIGN.md).
export const CHANNEL_NAME = 'CrAzYeNdErMaN'

// Fixed positions, so the banner looks the same on every visit: [left %, top %, size px, colour 1-3].
const PARTICLES = Array.from({ length: 24 }, (_, i) => [((i * 53 + 31) % 1240) / 12.4, ((i * 37 + 11) % 170) / 1.9, 4 + (i % 4) * 2, (i % 3) + 1])

// The channel page, YouTube-shaped: banner, avatar and name, then the Videos or Playlists tab.
export function ChannelPage({ tab }: { tab: 'videos' | 'playlists' }) {
  const [videos, reloadVideos] = useLoad('videos', listVideos)
  const [playlists, reloadPlaylists] = useLoad('playlists', listPlaylists)

  return (
    <>
      <div className="banner" aria-hidden="true">
        {PARTICLES.map(([left, top, size, colour], i) => (
          <span
            key={i}
            className={`particle particle-${colour}`}
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
          />
        ))}
      </div>
      <div className="page page-wide channel">
        <div className="channel-head">
          <div className="channel-id">
            <div className="channel-avatar">
              <EnderFace size={56} label={`${CHANNEL_NAME} avatar`} />
            </div>
            <div className="channel-text">
              <h1 className="channel-name">{CHANNEL_NAME}</h1>
              <p className="muted">{counts(videos, playlists)}</p>
            </div>
          </div>
          <nav className="tabs" aria-label="Channel">
            <NavLink to="/" end className={tabClass}>
              Videos
            </NavLink>
            <NavLink to="/playlists" end className={tabClass}>
              Playlists
            </NavLink>
          </nav>
        </div>

        {tab === 'videos' ? (
          <VideoGrid videos={videos} onRetry={reloadVideos} />
        ) : (
          <PlaylistGrid playlists={playlists} onRetry={reloadPlaylists} />
        )}
      </div>
    </>
  )
}

// Active tab = purple fill, the rest quiet (DESIGN.md: one purple per group).
const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'btn' : 'btn btn-quiet')

function counts(videos: Loaded<Video[]>, playlists: Loaded<PlaylistSummary[]>) {
  if (videos.kind !== 'ready' || playlists.kind !== 'ready') return ' '
  const published = videos.value.filter((v) => v.status === 'published').length
  return `${plurals(published, 'video')} · ${plurals(playlists.value.length, 'playlist')}`
}

function VideoGrid({ videos, onRetry }: { videos: Loaded<Video[]>; onRetry: () => void }) {
  if (videos.kind === 'loading') return <Loading what="videos" />
  if (videos.kind === 'failed') return <LoadFailed message={videos.message} onRetry={onRetry} />
  if (videos.value.length === 0) return <p className="muted">No videos yet. Check back soon!</p>
  return (
    <ul className="grid">
      {videos.value.map((video) => (
        <li key={video.id}>
          <VideoCard video={video} />
        </li>
      ))}
    </ul>
  )
}

export function VideoCard({ video }: { video: Video }) {
  return (
    <Link to={`/watch/${video.id}`} className="card">
      <Thumb url={video.thumbnail_url} />
      <span className="card-title">{video.title}</span>
      <span className="card-meta">
        {video.status === 'draft' ? <span className="chip">Draft</span> : timeAgo(video.published_at ?? video.created_at)}
      </span>
    </Link>
  )
}

export function Thumb({ url }: { url: string | null }) {
  return <span className="thumb">{url ? <img src={url} alt="" loading="lazy" /> : null}</span>
}

function PlaylistGrid({ playlists, onRetry }: { playlists: Loaded<PlaylistSummary[]>; onRetry: () => void }) {
  if (playlists.kind === 'loading') return <Loading what="playlists" />
  if (playlists.kind === 'failed') return <LoadFailed message={playlists.message} onRetry={onRetry} />
  if (playlists.value.length === 0) return <p className="muted">No playlists yet.</p>
  return (
    <ul className="grid">
      {playlists.value.map((playlist) => (
        <li key={playlist.id}>
          <Link to={`/playlists/${playlist.id}`} className="card">
            <Thumb url={playlist.thumbnail_url} />
            <span className="card-title">{playlist.title}</span>
            <span className="card-meta">{plurals(playlist.video_count, 'video')}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
