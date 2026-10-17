import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { DESCRIPTION_MAX, THUMBNAIL_ACCEPT, THUMBNAIL_MAX_BYTES, TITLE_MAX } from './api'
import './videoForm.css'

const THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Title, description, thumbnail and (for the admin) publish now. Used when saving a new upload
// and when the admin rescues a leftover one. The caller adds the video key and sends the form;
// onSave resolves to an error message, or null when it worked.
export function VideoDetailsForm({
  initialTitle = '',
  canPublish,
  ready,
  waitingLabel = 'Waiting for upload…',
  onSave,
  onCancel,
}: {
  initialTitle?: string
  canPublish: boolean
  // False while the video is still uploading: details can be filled in, not saved.
  ready: boolean
  waitingLabel?: string
  onSave: (form: FormData) => Promise<string | null>
  onCancel?: () => void
}) {
  const id = useId()
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [publish, setPublish] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => (thumbnail ? URL.createObjectURL(thumbnail) : null), [thumbnail])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  function chooseThumbnail(file: File | undefined) {
    setError(null)
    if (!file) return setThumbnail(null)
    if (!THUMBNAIL_TYPES.includes(file.type)) return setError('Thumbnails must be JPG, PNG or WebP images.')
    if (file.size > THUMBNAIL_MAX_BYTES) return setError('Thumbnails can be up to 5 MB.')
    setThumbnail(file)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give the video a title.')
    const form = new FormData()
    form.set('title', title)
    form.set('description', description)
    if (thumbnail) form.set('thumbnail', thumbnail)
    if (canPublish && publish) form.set('publish', 'true')
    setSaving(true)
    setError(await onSave(form))
    setSaving(false)
  }

  const saveLabel = !ready ? waitingLabel : saving ? 'Saving…' : canPublish ? (publish ? 'Publish video' : 'Save as draft') : 'Send for approval'

  return (
    <form className="video-form" onSubmit={submit} noValidate>
      <div className="video-form-fields">
        <div className="video-form-field">
          <label className="field-label" htmlFor={`${id}-title`}>
            Title
          </label>
          <input
            id={`${id}-title`}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            required
          />
        </div>

        <div className="video-form-field">
          <label className="field-label" htmlFor={`${id}-description`}>
            Description <span className="muted-inline">(optional)</span>
          </label>
          <textarea
            id={`${id}-description`}
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={5}
          />
        </div>

        {canPublish && (
          <label className="video-form-check">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish now (otherwise it's saved as a draft)
          </label>
        )}
      </div>

      <div className="video-form-field">
        <span className="field-label" id={`${id}-thumb-label`}>
          Thumbnail <span className="muted-inline">(optional)</span>
        </span>
        <span className="thumb video-form-preview">{preview && <img src={preview} alt="Thumbnail preview" />}</span>
        <span className="muted">JPG, PNG or WebP, up to 5 MB.</span>
        <div className="video-form-thumb-actions">
          <label className="btn btn-quiet btn-small btn-file">
            {thumbnail ? 'Change image' : 'Choose image'}
            <input
              type="file"
              accept={THUMBNAIL_ACCEPT}
              aria-labelledby={`${id}-thumb-label`}
              onChange={(e) => {
                chooseThumbnail(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {thumbnail && (
            <button type="button" className="btn-link" onClick={() => setThumbnail(null)}>
              Remove image
            </button>
          )}
        </div>
      </div>

      <div className="video-form-footer">
        {error && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
        <p className="muted">
          {canPublish ? 'Drafts stay hidden until you publish them.' : 'The admin approves it before anyone else can see it.'}
        </p>
        <div className="video-form-actions">
          {onCancel && (
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn" disabled={!ready || saving}>
            {saveLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
