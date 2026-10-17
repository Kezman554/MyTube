import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  listAllVideos,
  listPlaylists,
  removeFromPlaylist,
  reorderPlaylist,
  type AdminPlaylist,
} from '../playlists/api'
import type { Result, Video } from '../videos/api'
import './admin.css'

type Data = { playlists: AdminPlaylist[]; videos: Video[] }
type State = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; data: Data }

async function load(): Promise<State> {
  const [playlists, videos] = await Promise.all([listPlaylists(), listAllVideos()])
  if (!playlists.ok) return { kind: 'failed', message: playlists.message }
  if (!videos.ok) return { kind: 'failed', message: videos.message }
  return { kind: 'ready', data: { playlists: playlists.value, videos: videos.value } }
}

// Admin only: create playlists, then add, remove and reorder their videos.
export function Playlists() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const reload = useCallback(() => load().then(setState), [])

  useEffect(() => {
    let live = true
    load().then((next) => live && setState(next))
    return () => {
      live = false
    }
  }, [])

  // Swaps in a playlist as the server returned it after a change.
  const replace = (playlist: AdminPlaylist) =>
    setState((s) =>
      s.kind === 'ready'
        ? { ...s, data: { ...s.data, playlists: s.data.playlists.map((p) => (p.id === playlist.id ? playlist : p)) } }
        : s,
    )

  return (
    <section className="panel" aria-labelledby="playlists-title">
      <h2 id="playlists-title" className="panel-title">
        Playlists
      </h2>
      <CreatePlaylist onCreated={() => void reload()} />
      {state.kind === 'loading' && <p className="muted">Loading playlists…</p>}
      {state.kind === 'failed' && (
        <p className="alert-error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ready' &&
        state.data.playlists.map((playlist) => (
          <PlaylistEditor
            key={playlist.id}
            playlist={playlist}
            allVideos={state.data.videos}
            onChanged={replace}
            onStale={() => void reload()}
          />
        ))}
    </section>
  )
}

function CreatePlaylist({ onCreated }: { onCreated: () => void }) {
  const id = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give the playlist a title.')
    setBusy(true)
    const result = await createPlaylist(title, description)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    setTitle('')
    setDescription('')
    setError(null)
    onCreated()
  }

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <label className="field-label" htmlFor={`${id}-title`}>
        New playlist title
      </label>
      <input id={`${id}-title`} className="input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      <label className="field-label" htmlFor={`${id}-description`}>
        Description <span className="muted">(optional)</span>
      </label>
      <textarea
        id={`${id}-description`}
        className="input"
        rows={2}
        maxLength={5000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Creating…' : 'Create playlist'}
      </button>
    </form>
  )
}

function PlaylistEditor({
  playlist,
  allVideos,
  onChanged,
  onStale,
}: {
  playlist: AdminPlaylist
  allVideos: Video[]
  onChanged: (playlist: AdminPlaylist) => void
  onStale: () => void
}) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inPlaylist = new Set(playlist.videos.map((v) => v.id))
  const addable = allVideos.filter((v) => !inPlaylist.has(v.id))
  const [choice, setChoice] = useState('')

  async function act(change: () => Promise<Result<AdminPlaylist>>) {
    setBusy(true)
    const result = await change()
    setBusy(false)
    if (result.ok) {
      setError(null)
      onChanged(result.value)
    } else {
      setError(result.message)
    }
  }

  function move(index: number, by: -1 | 1) {
    const ids = playlist.videos.map((v) => v.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    void act(() => reorderPlaylist(playlist.id, ids))
  }

  async function remove() {
    setBusy(true)
    const result = await deletePlaylist(playlist.id)
    setBusy(false)
    if (result.ok) onStale()
    else setError(result.message)
  }

  return (
    <article className="admin-item" aria-labelledby={`${id}-name`}>
      <h3 id={`${id}-name`} className="admin-item-name">
        {playlist.title}
      </h3>
      {playlist.description && <p className="muted">{playlist.description}</p>}

      {playlist.videos.length === 0 ? (
        <p className="muted">No videos yet.</p>
      ) : (
        <ol className="admin-ordered">
          {playlist.videos.map((video, i) => (
            <li key={video.id} className="admin-ordered-item">
              <span className="admin-ordered-title">
                {video.title}
                {video.status === 'draft' && <span className="muted-inline"> (draft: hidden until published)</span>}
              </span>
              <span className="admin-actions">
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  disabled={busy || i === 0}
                  aria-label={`Move ${video.title} up`}
                  onClick={() => move(i, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  disabled={busy || i === playlist.videos.length - 1}
                  aria-label={`Move ${video.title} down`}
                  onClick={() => move(i, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  disabled={busy}
                  aria-label={`Remove ${video.title} from this playlist`}
                  onClick={() => void act(() => removeFromPlaylist(playlist.id, video.id))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {addable.length > 0 && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (choice) void act(() => addToPlaylist(playlist.id, Number(choice))).then(() => setChoice(''))
          }}
        >
          <label className="field-label" htmlFor={`${id}-add`}>
            Add a video
          </label>
          <div className="admin-inline">
            <select id={`${id}-add`} className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a video…</option>
              {addable.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                  {v.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-small" disabled={busy || !choice}>
              Add
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="alert-error" role="alert">
          {error}{' '}
          <button type="button" className="btn btn-quiet btn-small" onClick={onStale}>
            Reload
          </button>
        </p>
      )}

      <div className="admin-actions">
        {confirmDelete ? (
          <>
            <p className="admin-confirm">Delete this playlist? Its videos stay on the channel.</p>
            <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void remove()}>
              Yes, delete playlist
            </button>{' '}
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-danger btn-small" onClick={() => setConfirmDelete(true)}>
            Delete playlist
          </button>
        )}
      </div>
    </article>
  )
}
