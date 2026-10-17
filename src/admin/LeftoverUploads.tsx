import { useState } from 'react'
import { formatBytes } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { createVideo, deleteOrphan, listOrphans, type Orphan } from '../videos/api'
import { VideoDetailsForm } from '../videos/VideoDetailsForm'
import './admin.css'

// Admin only: video files in storage with no video record, from uploads whose details were
// never saved. Each can be given a title and saved as a video, or deleted to free the space.
// Shows nothing at all when there are none.
export function LeftoverUploads() {
  const [orphans, reload] = useLoad('orphans', listOrphans)

  if (orphans.kind === 'loading' || (orphans.kind === 'ready' && orphans.value.length === 0)) return null

  return (
    <section className="panel panel-attention" aria-labelledby="leftovers-title">
      <h2 id="leftovers-title" className="panel-title">
        Leftover uploads
      </h2>
      {orphans.kind === 'failed' ? (
        <p className="alert-error" role="alert">
          {orphans.message}
        </p>
      ) : (
        <>
          <p className="muted">
            These video files finished uploading but were never saved as videos. Save each one with a title, or
            delete it to free up storage.
          </p>
          <ul className="admin-list">
            {orphans.value.map((orphan) => (
              <LeftoverRow key={orphan.key} orphan={orphan} onChanged={reload} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function LeftoverRow({ orphan, onChanged }: { orphan: Orphan; onChanged: () => void }) {
  const [mode, setMode] = useState<'closed' | 'saving' | 'confirmDelete'>('closed')
  const [error, setError] = useState<string | null>(null)
  const name = orphan.filename ?? orphan.key.slice(orphan.key.lastIndexOf('/') + 1)

  async function save(form: FormData) {
    form.set('key', orphan.key)
    const result = await createVideo(form)
    if (!result.ok) return result.message
    onChanged()
    return null
  }

  async function remove() {
    const result = await deleteOrphan(orphan.key)
    if (result.ok) onChanged()
    else setError(result.message)
  }

  return (
    <li className="admin-item">
      <p className="admin-item-name">{name}</p>
      <p className="muted">
        {formatBytes(orphan.size)} · uploaded {new Date(orphan.uploaded_at).toLocaleString()}
        {orphan.uploaded_by ? ` by ${orphan.uploaded_by.username}` : ''}
      </p>
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}

      {mode === 'closed' && (
        <div className="admin-actions">
          <button type="button" className="btn btn-small" onClick={() => setMode('saving')}>
            Save as video
          </button>
          <button type="button" className="btn btn-danger btn-small" onClick={() => setMode('confirmDelete')}>
            Delete file
          </button>
        </div>
      )}

      {mode === 'confirmDelete' && (
        <div className="admin-actions">
          <p className="admin-confirm">Delete this file for good? This can't be undone.</p>
          <button type="button" className="btn btn-danger btn-small" onClick={() => void remove()}>
            Yes, delete file
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setMode('closed')}>
            Keep it
          </button>
        </div>
      )}

      {mode === 'saving' && (
        <VideoDetailsForm
          initialTitle={name.replace(/\.[^.]+$/, '')}
          canPublish
          ready
          onSave={save}
          onCancel={() => setMode('closed')}
        />
      )}
    </li>
  )
}
