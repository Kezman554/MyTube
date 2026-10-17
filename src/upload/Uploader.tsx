import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { formatBytes } from '../lib/format'
import { createVideo, type Video } from '../videos/api'
import { VideoDetailsForm } from '../videos/VideoDetailsForm'
import { httpUploadApi } from './httpApi'
import { ACCEPT_ATTRIBUTE, isAcceptedVideo, uploadFile } from './uploadFile'
import './uploader.css'

type Upload =
  | { kind: 'uploading'; sent: number; note: string | null }
  | { kind: 'done'; key: string }
  | { kind: 'failed'; message: string }

type State =
  | { kind: 'idle'; message: string | null }
  | { kind: 'working'; file: File; upload: Upload }
  | { kind: 'saved'; video: Video }

// "My Ender Farm.mp4" -> "My Ender Farm", as a starting title.
const titleFrom = (filename: string) => filename.replace(/\.[^.]+$/, '').slice(0, 100)

// Upload a video, and while it goes up, fill in its title, description and thumbnail.
// Saving creates the video record once the file is safely in storage.
export function Uploader({ canPublish }: { canPublish: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle', message: null })
  const controller = useRef<AbortController | null>(null)
  const uploading = state.kind === 'working' && state.upload.kind === 'uploading'

  // Warn before closing the tab mid-upload.
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const setUpload = (upload: Upload) => setState((s) => (s.kind === 'working' ? { ...s, upload } : s))

  async function upload(file: File) {
    if (!isAcceptedVideo(file)) {
      setState({ kind: 'idle', message: 'Only MP4, MOV and WebM videos can be uploaded.' })
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setState((s) =>
      s.kind === 'working' && s.file === file
        ? { ...s, upload: { kind: 'uploading', sent: 0, note: null } }
        : { kind: 'working', file, upload: { kind: 'uploading', sent: 0, note: null } },
    )
    try {
      const { key } = await uploadFile(file, {
        api: httpUploadApi,
        signal: abort.signal,
        onProgress: (sent) => setUpload({ kind: 'uploading', sent, note: null }),
        onRetry: ({ partNumber, attempt, attempts }) =>
          setState((s) =>
            s.kind === 'working' && s.upload.kind === 'uploading'
              ? {
                  ...s,
                  upload: {
                    ...s.upload,
                    note: `Connection trouble: retrying ${partNumber ? `part ${partNumber}` : 'the last step'} (try ${attempt} of ${attempts})…`,
                  },
                }
              : s,
          ),
      })
      setUpload({ kind: 'done', key })
    } catch (err) {
      if (abort.signal.aborted) setState({ kind: 'idle', message: null })
      else setUpload({ kind: 'failed', message: err instanceof Error ? err.message : 'The upload failed.' })
    } finally {
      controller.current = null
    }
  }

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void upload(file)
  }

  async function save(key: string, form: FormData) {
    form.set('key', key)
    const result = await createVideo(form)
    if (!result.ok) return result.message
    setState({ kind: 'saved', video: result.value })
    return null
  }

  if (state.kind === 'working') {
    const { file, upload: current } = state
    return (
      <>
        <UploadStatus file={file} upload={current} onCancel={() => controller.current?.abort()} onRetry={() => void upload(file)} />
        <VideoDetailsForm
          initialTitle={titleFrom(file.name)}
          canPublish={canPublish}
          ready={current.kind === 'done'}
          waitingLabel={current.kind === 'failed' ? 'Upload failed' : 'Waiting for upload…'}
          onSave={(form) => (current.kind === 'done' ? save(current.key, form) : Promise.resolve(null))}
        />
      </>
    )
  }

  return (
    <div className="panel uploader-pick">
      {state.kind === 'saved' && (
        <p className="alert-ok" role="status">
          {state.video.status === 'published' ? 'Published' : 'Saved as a draft'}:{' '}
          <Link to={`/watch/${state.video.id}`}>{state.video.title}</Link>.
          {state.video.status === 'draft' && !canPublish && ' It will appear on the channel once it has been approved.'}
        </p>
      )}
      {state.kind === 'idle' && state.message && (
        <p className="alert-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="muted">MP4, MOV or WebM, up to 4 GB. Keep this page open until it finishes.</p>
      <label className="btn btn-file">
        {state.kind === 'saved' ? 'Upload another' : 'Choose video'}
        <input type="file" accept={ACCEPT_ATTRIBUTE} onChange={choose} />
      </label>
    </div>
  )
}

function UploadStatus({ file, upload, onCancel, onRetry }: { file: File; upload: Upload; onCancel: () => void; onRetry: () => void }) {
  const sent = upload.kind === 'done' ? file.size : upload.kind === 'uploading' ? upload.sent : 0
  const percent = file.size ? Math.floor((sent / file.size) * 100) : 100

  return (
    <div className="panel uploader-status">
      <div className="uploader-status-head">
        <span className="uploader-file">
          {file.name} <span className="muted-inline">· {formatBytes(file.size)}</span>
        </span>
        {upload.kind !== 'failed' && <span className="uploader-percent">{percent}%</span>}
      </div>

      {upload.kind === 'failed' ? (
        <div className="alert-error" role="alert">
          <p>{upload.message}</p>
          <button type="button" className="btn btn-small" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="uploader-bar" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="uploader-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="muted" aria-live="polite">
            {upload.kind === 'done'
              ? 'Uploaded. Add the details below and save.'
              : `${formatBytes(sent)} of ${formatBytes(file.size)}. You can fill in the details while it uploads.`}
          </p>
          {upload.kind === 'uploading' && upload.note && <p className="uploader-note">{upload.note}</p>}
          {upload.kind === 'uploading' && (
            <button type="button" className="btn btn-danger btn-small uploader-cancel" onClick={onCancel}>
              Cancel upload
            </button>
          )}
        </>
      )}
    </div>
  )
}
