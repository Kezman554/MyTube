import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { httpUploadApi } from './httpApi'
import { ACCEPT_ATTRIBUTE, isAcceptedVideo, uploadFile } from './uploadFile'
import './uploader.css'

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; file: File; sent: number; note: string | null }
  | { kind: 'done'; file: File }
  | { kind: 'failed'; file: File | null; message: string }

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

// Picks a video and uploads it in parts with a progress bar. Saving it as a video (title,
// thumbnail and so on) is a later step; this only gets the file safely into storage.
export function Uploader() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const uploading = state.kind === 'uploading'

  // Warn before closing the tab mid-upload.
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  async function upload(file: File) {
    if (!isAcceptedVideo(file)) {
      setState({ kind: 'failed', file: null, message: 'Only MP4, MOV and WebM videos can be uploaded.' })
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setState({ kind: 'uploading', file, sent: 0, note: null })
    try {
      await uploadFile(file, {
        api: httpUploadApi,
        signal: abort.signal,
        onProgress: (sent) => setState((s) => (s.kind === 'uploading' ? { ...s, sent } : s)),
        onRetry: ({ partNumber, attempt, attempts }) =>
          setState((s) =>
            s.kind === 'uploading'
              ? {
                  ...s,
                  note: `Connection trouble: retrying ${partNumber ? `part ${partNumber}` : 'the last step'} (try ${attempt} of ${attempts})…`,
                }
              : s,
          ),
      })
      setState({ kind: 'done', file })
    } catch (err) {
      if (abort.signal.aborted) setState({ kind: 'idle' })
      else setState({ kind: 'failed', file, message: err instanceof Error ? err.message : 'The upload failed.' })
    } finally {
      controller.current = null
    }
  }

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void upload(file)
  }

  const percent = state.kind === 'uploading' && state.file.size ? Math.floor((state.sent / state.file.size) * 100) : 0

  return (
    <section className="uploader" aria-labelledby="uploader-title">
      <h2 id="uploader-title" className="uploader-title">
        Upload a video
      </h2>

      {state.kind === 'uploading' ? (
        <>
          <p className="uploader-file">{state.file.name}</p>
          <div
            className="uploader-bar"
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="uploader-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="uploader-meta" aria-live="polite">
            {percent}% · {formatBytes(state.sent)} of {formatBytes(state.file.size)}
          </p>
          {state.note && <p className="uploader-note">{state.note}</p>}
          <button type="button" className="uploader-button uploader-button-danger" onClick={() => controller.current?.abort()}>
            Cancel upload
          </button>
        </>
      ) : (
        <>
          {state.kind === 'done' && (
            <p className="uploader-done" role="status">
              Uploaded <strong>{state.file.name}</strong> ({formatBytes(state.file.size)}).
            </p>
          )}
          {state.kind === 'failed' && (
            <div className="uploader-error" role="alert">
              <p>{state.message}</p>
              {state.file && (
                <button type="button" className="uploader-button" onClick={() => void upload(state.file!)}>
                  Try again
                </button>
              )}
            </div>
          )}
          <p className="uploader-hint">MP4, MOV or WebM, up to 4 GB. Keep this page open until it finishes.</p>
          <label className="uploader-button uploader-pick">
            {state.kind === 'idle' ? 'Choose video' : 'Choose another'}
            <input type="file" accept={ACCEPT_ATTRIBUTE} onChange={choose} />
          </label>
        </>
      )}
    </section>
  )
}
