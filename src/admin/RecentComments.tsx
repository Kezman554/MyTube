import { useState } from 'react'
import { Link } from 'react-router'
import { commentAge } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { LoadFailed, Loading } from '../pages/Status'
import { deleteComment, listRecentComments, updateUser, type RecentComment } from './api'
import '../pages/comments.css'
import './admin.css'

// Admin only: the newest comments on every video. Delete asks first (it can't be undone);
// Mute is one click because Unmute sits in the same place and the Users tab can undo it too.
export function RecentComments() {
  const [comments, reload] = useLoad('recent-comments', listRecentComments)

  if (comments.kind === 'loading') return <Loading what="comments" />
  if (comments.kind === 'failed') return <LoadFailed message={comments.message} onRetry={reload} />

  return (
    <section className="panel" aria-labelledby="recent-comments-title">
      <h2 id="recent-comments-title" className="panel-title">
        Recent comments
      </h2>
      {comments.value.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="admin-list">
          {comments.value.map((comment) => (
            <CommentRow key={comment.id} comment={comment} onChanged={reload} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CommentRow({ comment, onChanged }: { comment: RecentComment; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = comment
  const muted = !user.can_comment

  // Muting changes every row by the same person, so the whole list is reloaded.
  async function act(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (result.ok) onChanged()
    else setError(result.message ?? null)
  }

  return (
    <li className="admin-item">
      <p className="comment-meta">
        <span className="comment-name">{user.username}</span>{' '}
        <time className="muted-inline" dateTime={comment.created_at}>
          · {commentAge(comment.created_at)}
        </time>{' '}
        <span className="muted-inline">
          on <Link to={`/watch/${comment.video.id}`}>{comment.video.title}</Link>
        </span>
      </p>
      <p className="comment-body">{comment.body}</p>
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="admin-actions">
          <p className="admin-confirm">Delete this comment by {user.username}? It can't be undone.</p>
          <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void act(() => deleteComment(comment.id))}>
            Yes, delete
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="admin-actions">
          <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => setConfirming(true)}>
            Delete
          </button>
          {user.role !== 'admin' &&
            (muted ? (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                disabled={busy}
                onClick={() => void act(() => updateUser(user.id, { can_comment: true }))}
              >
                Unmute {user.username}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                disabled={busy}
                onClick={() => void act(() => updateUser(user.id, { can_comment: false }))}
              >
                Mute {user.username}
              </button>
            ))}
          {muted && <span className="chip">Muted</span>}
        </div>
      )}
    </li>
  )
}
