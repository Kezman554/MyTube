import { useCallback, useEffect, useState } from 'react'
import { createVideo, deleteOrphan, listOrphans, type Orphan } from '../videos/api'
import { VideoDetailsForm } from '../videos/VideoDetailsForm'
import './leftovers.css'

type State = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; orphans: Orphan[] }

const load = (): Promise<State> =>
  listOrphans().then((r) => (r.ok ? { kind: 'ready', orphans: r.value } : { kind: 'failed', message: r.message }))

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

// Admin only: video files in storage with no video record, from uploads whose details were
// never saved. Each can be given a title and saved as a video, or deleted to free the space.
// Shows nothing at all when there are none.
export function LeftoverUploads() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const refresh = useCallback(() => load().then(setState), [])

  useEffect(() => {
    let live = true
    load().then((next) => live && setState(next))
    return () => {
      live = false
    }
  }, [])

  if (state.kind === 'loading' || (state.kind === 'ready' && state.orphans.length === 0)) return null

  return (
    <section className="leftovers" aria-labelledby="leftovers-title">
      <h2 id="leftovers-title" className="leftovers-title">
        Leftover uploads
      </h2>
      {state.kind === 'failed' ? (
        <p className="leftovers-error" role="alert">
          {state.message}
        </p>
      ) : (
        <>
          <p className="leftovers-intro">
            These video files finished uploading but were never saved as videos. Save each one with a title, or
            delete it to free up storage.
          </p>
          <ul className="leftovers-list">
            {state.orphans.map((orphan) => (
              <LeftoverRow key={orphan.key} orphan={orphan} onChanged={refresh} />
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
    <li className="leftovers-item">
      <p className="leftovers-name">{name}</p>
      <p className="leftovers-meta">
        {formatBytes(orphan.size)} · uploaded {new Date(orphan.uploaded_at).toLocaleString()}
        {orphan.uploaded_by ? ` by ${orphan.uploaded_by.username}` : ''}
      </p>
      {error && (
        <p className="leftovers-error" role="alert">
          {error}
        </p>
      )}

      {mode === 'closed' && (
        <div className="leftovers-actions">
          <button type="button" className="leftovers-button" onClick={() => setMode('saving')}>
            Save as video
          </button>
          <button type="button" className="leftovers-button leftovers-button-danger" onClick={() => setMode('confirmDelete')}>
            Delete file
          </button>
        </div>
      )}

      {mode === 'confirmDelete' && (
        <div className="leftovers-actions">
          <p className="leftovers-confirm">Delete this file for good? This can't be undone.</p>
          <button type="button" className="leftovers-button leftovers-button-danger" onClick={() => void remove()}>
            Yes, delete file
          </button>
          <button type="button" className="leftovers-button leftovers-button-quiet" onClick={() => setMode('closed')}>
            Keep it
          </button>
        </div>
      )}

      {mode === 'saving' && (
        <>
          <VideoDetailsForm initialTitle={name.replace(/\.[^.]+$/, '')} canPublish ready onSave={save} />
          <button type="button" className="leftovers-button leftovers-button-quiet" onClick={() => setMode('closed')}>
            Cancel
          </button>
        </>
      )}
    </li>
  )
}
