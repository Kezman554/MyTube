import { Link } from 'react-router'

// Shared page states: loading, a failed load with a retry, and not found.

export function Loading({ what }: { what: string }) {
  return (
    <p className="muted" aria-live="polite">
      Loading {what}…
    </p>
  )
}

export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="alert-error" role="alert">
      <p>{message}</p>
      <button type="button" className="btn btn-quiet btn-small" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

// Also what a page answers when your role can't use it, so it doesn't reveal that it exists.
export function NotFoundPage() {
  return (
    <div className="page">
      <h1 className="page-title">Nothing here</h1>
      <p>That page doesn't exist, or it isn't one you can open.</p>
      <p>
        <Link to="/" className="btn">
          Back to the channel
        </Link>
      </p>
    </div>
  )
}
