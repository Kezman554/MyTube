import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { BANNER_MAX_BYTES, BIO_MAX, bioLength, getChannel, removeBanner, saveBio, uploadBanner, type Channel } from '../channel/api'
import { useLoad } from '../lib/useLoad'
import { TickMark } from '../shell/Pixels'
import { Banner } from './ChannelPage'
import { LoadFailed, Loading } from './Status'
import './channelSettings.css'

// Channel settings, for the channel's owner and the admin (the route is guarded in App.tsx): the
// banner and the bio, nothing else. The owner is nine, so each part says plainly whether it is saved.
export function ChannelSettingsPage() {
  const [channel, reload] = useLoad('channel-settings', getChannel)
  // After a save, the page shows the server's answer straight away rather than reloading.
  const [current, setCurrent] = useState<Channel | null>(null)
  const value = current ?? (channel.kind === 'ready' ? channel.value : null)

  return (
    <div className="page">
      <h1 className="page-title">Channel settings</h1>
      {channel.kind === 'loading' && <Loading what="your channel" />}
      {channel.kind === 'failed' && <LoadFailed message={channel.message} onRetry={reload} />}
      {value && (
        <div className="settings">
          <BannerSettings channel={value} onSaved={setCurrent} />
          <BioSettings channel={value} onSaved={setCurrent} />
          <p>
            <Link to="/">See your channel</Link>
          </p>
        </div>
      )}
    </div>
  )
}

// "Saved" (green, with a tick) or "Not saved yet" (magenta border): always in words.
function SaveState({ saved, id }: { saved: boolean; id?: string }) {
  return (
    <p id={id} className={saved ? 'save-state save-state-saved' : 'save-state save-state-unsaved'} role="status">
      {saved ? (
        <>
          <TickMark size={16} /> Saved
        </>
      ) : (
        'Not saved yet'
      )}
    </p>
  )
}

function BannerSettings({ channel, onSaved }: { channel: Channel; onSaved: (c: Channel) => void }) {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  // The chosen picture, shown from the computer before it is saved. Its object URL is freed when it
  // is replaced, saved, cancelled, or the page closes.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null)
  const pickedUrl = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown after a save until something changes, so the owner sees it worked.
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => () => {
    if (pickedUrl.current) URL.revokeObjectURL(pickedUrl.current)
  }, [])

  function pick(next: File | null) {
    if (pickedUrl.current) URL.revokeObjectURL(pickedUrl.current)
    const url = next ? URL.createObjectURL(next) : null
    pickedUrl.current = url
    setPicked(next && url ? { file: next, url } : null)
  }

  function choose(chosen: File | undefined) {
    setError(null)
    setJustSaved(false)
    setConfirmRemove(false)
    if (!chosen) return
    if (chosen.size > BANNER_MAX_BYTES) {
      setError('That picture is too big. Pick one under 5 MB.')
      return
    }
    pick(chosen)
  }

  function cancel() {
    pick(null)
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function act(action: () => ReturnType<typeof removeBanner>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (result.ok) {
      onSaved(result.value)
      setJustSaved(true)
      setConfirmRemove(false)
      cancel()
    } else {
      setError(result.message)
    }
  }

  return (
    <section className="panel settings-part" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">
        Banner
      </h2>
      <p className="muted">The picture across the top of your channel. JPG, PNG or WebP, up to 5 MB.</p>

      <div className="settings-preview">
        <Banner url={picked?.url ?? channel.banner_url} />
        {picked && <span className="chip settings-preview-chip">Preview</span>}
      </div>

      {picked ? (
        <>
          <SaveState saved={false} />
          <div className="admin-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void act(() => uploadBanner(picked.file))}>
              {busy ? 'Saving…' : 'Save banner'}
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      ) : confirmRemove ? (
        <div className="admin-actions">
          <p className="admin-confirm">Remove your picture and go back to the purple banner?</p>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(removeBanner)}>
            {busy ? 'Removing…' : 'Yes, remove it'}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setConfirmRemove(false)}>
            Keep it
          </button>
        </div>
      ) : (
        <>
          {justSaved && <SaveState saved />}
          <div className="admin-actions">
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              {channel.banner_url ? 'Choose a new picture' : 'Choose a picture'}
            </button>
            {channel.banner_url && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmRemove(true)}>
                Remove banner
              </button>
            )}
          </div>
        </>
      )}
      <input
        ref={fileInput}
        id={`${id}-file`}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function BioSettings({ channel, onSaved }: { channel: Channel; onSaved: (c: Channel) => void }) {
  const id = useId()
  const [text, setText] = useState(channel.bio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const length = bioLength(text)
  const tooLong = length > BIO_MAX
  // Saved when what's in the box is what the channel shows (ignoring spaces the server trims).
  const saved = text.replace(/\r\n?/g, '\n').trim() === channel.bio

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (tooLong) {
      setError(`That's ${length - BIO_MAX} too many characters. Make it a bit shorter.`)
      return
    }
    setBusy(true)
    setError(null)
    const result = await saveBio(text)
    setBusy(false)
    if (result.ok) {
      onSaved(result.value)
      setText(result.value.bio)
    } else {
      setError(result.message)
    }
  }

  return (
    <section className="panel settings-part" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">
        Bio
      </h2>
      <form className="settings-bio" onSubmit={submit} noValidate>
        <label className="field-label" htmlFor={`${id}-text`}>
          A few words about your channel, shown under its name
        </label>
        <textarea
          id={`${id}-text`}
          className="input settings-bio-input"
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          aria-describedby={`${id}-count ${id}-state`}
          aria-invalid={tooLong || undefined}
        />
        <div className="settings-bio-row">
          <span id={`${id}-count`} className={tooLong ? 'settings-count settings-count-over' : 'settings-count'} aria-live="polite">
            {length} / {BIO_MAX}
          </span>
          <SaveState saved={saved} id={`${id}-state`} />
        </div>
        {!saved && (
          <div className="admin-actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save bio'}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => {
                setText(channel.bio)
                setError(null)
              }}
            >
              Undo
            </button>
          </div>
        )}
        {error && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
