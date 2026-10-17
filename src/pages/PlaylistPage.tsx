import { Link, useParams } from 'react-router'
import { plurals } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { getPlaylist } from '../videos/api'
import { VideoCard } from './ChannelPage'
import { LoadFailed, Loading, NotFoundPage } from './Status'
import './channel.css'

// One playlist: its title and description, then its published videos in order.
export function PlaylistPage() {
  const { id = '' } = useParams()
  const [data, reload] = useLoad(`playlist:${id}`, () => getPlaylist(id))

  if (data.kind === 'failed' && data.status === 404) return <NotFoundPage />

  return (
    <div className="page page-wide">
      <p>
        <Link to="/playlists">All playlists</Link>
      </p>
      {data.kind === 'loading' && <Loading what="the playlist" />}
      {data.kind === 'failed' && <LoadFailed message={data.message} onRetry={reload} />}
      {data.kind === 'ready' && (
        <>
          <div className="stack-tight">
            <h1 className="page-title">{data.value.playlist.title}</h1>
            <p className="muted">{plurals(data.value.videos.length, 'video')}</p>
            {data.value.playlist.description && <p>{data.value.playlist.description}</p>}
          </div>
          {data.value.videos.length === 0 ? (
            <p className="muted">No videos in this playlist yet.</p>
          ) : (
            <ol className="grid">
              {data.value.videos.map((video) => (
                <li key={video.id}>
                  <VideoCard video={video} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
