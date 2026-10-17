import { useState, type FormEvent, type ReactNode } from 'react'
import { register, type Me } from './api'

// Screens shown by AuthGate before the main app. Routing between them lives in AuthGate only.

function GateFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="gate">
      <section className="gate-panel" aria-labelledby="gate-title">
        <p className="gate-wordmark">MyTube</p>
        <h1 id="gate-title" className="gate-title">
          {title}
        </h1>
        {children}
      </section>
    </main>
  )
}

export function GateMessage({
  title,
  busy,
  action,
  children,
}: {
  title: string
  busy?: boolean
  action?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  return (
    <GateFrame title={title}>
      {children && <p className="gate-text">{children}</p>}
      {busy && <p className="gate-text" aria-live="polite">One moment…</p>}
      {action && (
        <button type="button" className="gate-button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </GateFrame>
  )
}

export function RegisterPage({ email, onRegistered }: { email: string; onRegistered: (me: Me) => void }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await register(username)
      if (result.ok) return onRegistered(result.me)
      setError(result.message)
    } catch {
      setError("Couldn't reach MyTube. Check your connection and try again.")
    }
    setSubmitting(false)
  }

  return (
    <GateFrame title="Welcome">
      <p className="gate-text">
        You're signed in as <strong>{email}</strong>. Pick a username: it's the name everyone sees next to your
        likes and comments.
      </p>
      <form className="gate-form" onSubmit={submit} noValidate>
        <label className="gate-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="gate-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={20}
          aria-describedby="username-hint"
          aria-invalid={error ? true : undefined}
          required
        />
        <p id="username-hint" className="gate-hint">
          3 to 20 letters, numbers, underscores or hyphens.
        </p>
        {error && (
          <p className="gate-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="gate-button" disabled={submitting}>
          {submitting ? 'Joining…' : 'Join'}
        </button>
      </form>
    </GateFrame>
  )
}

export function WaitingPage({ username, onCheckAgain }: { username: string; onCheckAgain: () => void }) {
  return (
    <GateFrame title="Almost there">
      <p className="gate-text">
        Thanks{username && <>, <strong>{username}</strong></>}! Your request to join the channel has been sent.
      </p>
      <p className="gate-text">
        Once you're approved, the videos will appear right here. You can close this page and come back later.
      </p>
      <button type="button" className="gate-button gate-button-quiet" onClick={onCheckAgain}>
        Check again
      </button>
    </GateFrame>
  )
}

export function RemovedPage() {
  return (
    <GateFrame title="Access removed">
      <p className="gate-text">
        Your access to this channel has been removed. If you think this is a mistake, ask the person who invited
        you.
      </p>
    </GateFrame>
  )
}
