import { Link } from 'react-router'
import { commentAge, plurals } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Thumb } from '../pages/ChannelPage'
import { LoadFailed, Loading } from '../pages/Status'
import { getDashboard, type Dashboard as Data, type WeekCount } from './api'
import './dashboard.css'

// Decimal units throughout, as Cloudflare counts the free tier, so the bar and its words agree.
function decimalBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} kB`
  return `${bytes} bytes`
}

// "Yesterday" reads as "Last watched yesterday" mid-sentence.
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

// The admin only (the tab and the API are both admin-only): what needs you, the last week, who's
// watching, what's popular, and how much room is left.
export function Dashboard() {
  const [data, reload] = useLoad('dashboard', getDashboard)
  if (data.kind === 'loading') return <Loading what="the dashboard" />
  if (data.kind === 'failed') return <LoadFailed message={data.message} onRetry={reload} />
  const d = data.value
  return (
    <div className="dash">
      <Attention attention={d.attention} />
      <section aria-labelledby="dash-week">
        <h2 id="dash-week" className="dash-title">
          Last 7 days
        </h2>
        <ul className="dash-tiles">
          <WeekTile label="Views" count={d.week.views} />
          <WeekTile label="Likes" count={d.week.likes} />
          <WeekTile label="Comments" count={d.week.comments} />
          <WeekTile label="New people" count={d.week.users} />
        </ul>
      </section>
      <div className="dash-columns">
        <Watchers watchers={d.watchers} />
        <TopVideos videos={d.top_videos} />
      </div>
      <Storage storage={d.storage} />
    </div>
  )
}

// Only what needs doing, each linking to the tab where it's done. Nothing at all when nothing does.
function Attention({ attention }: { attention: Data['attention'] }) {
  const items = [
    attention.pending_users > 0 && {
      to: '/admin/users',
      text: `${plurals(attention.pending_users, 'person', 'people')} waiting for approval`,
      tab: 'Users',
    },
    attention.drafts > 0 && {
      to: '/admin/drafts',
      text: `${plurals(attention.drafts, 'draft')} waiting for review`,
      tab: 'Drafts',
    },
    attention.leftover_uploads.count > 0 && {
      to: '/admin/content',
      text: `${plurals(attention.leftover_uploads.count, 'leftover upload')} (${decimalBytes(attention.leftover_uploads.bytes)})`,
      tab: 'Content',
    },
  ].filter((x): x is { to: string; text: string; tab: string } => Boolean(x))

  if (items.length === 0) return <p className="muted dash-calm">Nothing needs you right now.</p>
  return (
    <section className="panel panel-attention" aria-labelledby="dash-attention">
      <h2 id="dash-attention" className="panel-title">
        Needs you
      </h2>
      <ul className="dash-attention">
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to}>{item.text}</Link> <span className="muted-inline">in {item.tab}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// This week's number, last week's, and the change in words (never colour alone).
function change({ current, previous }: WeekCount) {
  const diff = current - previous
  if (diff === 0) return 'Same as the week before'
  return `${diff > 0 ? 'Up' : 'Down'} ${Math.abs(diff).toLocaleString()} on the week before (${previous.toLocaleString()})`
}

function WeekTile({ label, count }: { label: string; count: WeekCount }) {
  return (
    <li className="dash-tile">
      <span className="dash-tile-number">{count.current.toLocaleString()}</span>
      <span className="dash-tile-label">{label}</span>
      <span className="dash-tile-change">{change(count)}</span>
    </li>
  )
}

function Watchers({ watchers }: { watchers: Data['watchers'] }) {
  return (
    <section className="panel" aria-labelledby="dash-watchers">
      <h2 id="dash-watchers" className="panel-title">
        Who&apos;s been watching
      </h2>
      <p className="muted">Views in the last 7 days, most active first.</p>
      <ul className="dash-list">
        {watchers.map((u) => (
          <li key={u.id} className="dash-watcher">
            <span className="dash-watcher-name">
              {u.username}
              {u.is_admin ? ' (you)' : ''}
            </span>
            <span className="dash-watcher-views">{plurals(u.views_7d, 'view')}</span>
            <span className="muted dash-watcher-last">{u.last_view_at ? `Last watched ${lowerFirst(commentAge(u.last_view_at))}` : "Hasn't watched yet"}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TopVideos({ videos }: { videos: Data['top_videos'] }) {
  return (
    <section className="panel" aria-labelledby="dash-top">
      <h2 id="dash-top" className="panel-title">
        Top videos
      </h2>
      <p className="muted">Most viewed in the last 30 days.</p>
      {videos.length === 0 ? (
        <p className="muted">No views in the last 30 days.</p>
      ) : (
        <ol className="dash-list dash-top">
          {videos.map((v, i) => (
            <li key={v.id} className="dash-top-item">
              <span className="dash-top-rank" aria-hidden="true">
                {i + 1}
              </span>
              <Link to={`/watch/${v.id}`} className="dash-top-thumb" tabIndex={-1} aria-hidden="true">
                <Thumb url={v.thumbnail_url} />
              </Link>
              <span className="dash-top-text">
                <Link to={`/watch/${v.id}`} className="dash-top-title">
                  {v.title}
                </Link>
                <span className="muted">{plurals(v.views_30d, 'view')}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Storage({ storage }: { storage: Data['storage'] }) {
  const percent = Math.min(100, (storage.bytes / storage.free_tier_bytes) * 100)
  const shown = percent > 0 && percent < 1 ? '<1' : Math.round(percent).toString()
  return (
    <section className="panel" aria-labelledby="dash-storage">
      <h2 id="dash-storage" className="panel-title">
        Storage
      </h2>
      <p>
        {decimalBytes(storage.bytes)} of the {decimalBytes(storage.free_tier_bytes)} free tier ({shown}%)
      </p>
      <div
        className="dash-bar"
        role="progressbar"
        aria-label="Storage used of the free tier"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${decimalBytes(storage.bytes)} of ${decimalBytes(storage.free_tier_bytes)}`}
      >
        <div className="dash-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <dl className="dash-facts">
        <div>
          <dt>Videos</dt>
          <dd>{decimalBytes(storage.by_prefix.videos)}</dd>
        </div>
        <div>
          <dt>Thumbnails</dt>
          <dd>{decimalBytes(storage.by_prefix.thumbnails)}</dd>
        </div>
        <div>
          <dt>Banner</dt>
          <dd>{decimalBytes(storage.by_prefix.banners)}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{storage.objects.toLocaleString()}</dd>
        </div>
      </dl>
      <h3 className="dash-subtitle">Database rows</h3>
      <dl className="dash-facts">
        <div>
          <dt>Users</dt>
          <dd>{storage.rows.users.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Videos</dt>
          <dd>{storage.rows.videos.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Comments</dt>
          <dd>{storage.rows.comments.toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  )
}
