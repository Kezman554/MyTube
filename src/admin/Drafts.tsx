import { useState } from 'react'
import { useLoad } from '../lib/useLoad'
import { LoadFailed, Loading } from '../pages/Status'
import { listDrafts, publishDraft, rejectDraft, type Draft } from './api'
import './admin.css'

// Admin only: creator drafts waiting for review, oldest first. Each can be watched here, then
// published for everyone or rejected (which deletes it for good, so it asks first).
export function Drafts() {
  const [drafts, reload] = useLoad('drafts', listDrafts)

  if (drafts.kind === 'loading') return <Loading what="drafts" />
  if (drafts.kind === 'failed') return <LoadFailed message={drafts.message} onRetry={reload} />

  return (
    <section className={drafts.value.length > 0 ? 'panel panel-attention' : 'panel'} aria-labelledby="drafts-title">
      <h2 id="drafts-title" className="panel-title">
        Waiting for review ({drafts.value.length})
      </h2>
      {drafts.value.length === 0 ? (
        <p className="muted">No drafts are waiting.</p>
      ) : (
        <ul className="admin-list">
          {drafts.value.map((draft) => (
            <DraftRow key={draft.id} draft={draft} onChanged={reload} />
          ))}
        </ul>
      )}
    </section>
  )
}

function DraftRow({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playFailed, setPlayFailed] = useState(false)

  async function act(action: (id: number) => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true)
    setError(null)
    const result = await action(draft.id)
    setBusy(false)
    if (result.ok) onChanged()
    else setError(result.message ?? null)
  }

  return (
    <li className="admin-item draft-item">
      <div className="draft-preview">
        {/* metadata only until play, as on the watch page. Draft plays never count as views. */}
        <video
          className="draft-video"
          src={`/api/stream/${draft.id}`}
          poster={draft.thumbnail_url ?? undefined}
          controls
          playsInline
          preload="metadata"
          onError={() => setPlayFailed(true)}
        >
          Your browser can't play this video.
        </video>
        {playFailed && <p className="muted">This video couldn't be played.</p>}
      </div>
      <div className="draft-details">
        <h3 className="admin-item-name">{draft.title}</h3>
        <p className="muted">
          From {draft.uploader.username} · sent {new Date(draft.created_at).toLocaleDateString()}
        </p>
        {draft.description && <p className="draft-description">{draft.description}</p>}
        {error && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
        {confirming ? (
          <div className="admin-actions">
            <p className="admin-confirm">
              Reject “{draft.title}”? The video and its thumbnail are deleted for good, and {draft.uploader.username} would
              need to upload it again.
            </p>
            <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void act(rejectDraft)}>
              Yes, reject
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="admin-actions">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void act(publishDraft)}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
            <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => setConfirming(true)}>
              Reject
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
