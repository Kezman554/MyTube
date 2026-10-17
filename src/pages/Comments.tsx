import { useId, useState, type FormEvent } from 'react'
import { deleteComment } from '../admin/api'
import { useMe } from '../auth/MeContext'
import { commentAge } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { COMMENT_MAX, listComments, postComment, type Comment } from '../videos/api'
import { LoadFailed, Loading } from './Status'
import './comments.css'

// The counter appears once a comment gets this close to the limit.
const COUNTER_FROM = COMMENT_MAX - 200

// Comments under a video: the box to add one (or a short message for muted users), then the
// comments newest first with who wrote them and when.
export function Comments({ videoId, published }: { videoId: number; published: boolean }) {
  const { user } = useMe()
  const [comments, reload] = useLoad(`comments:${videoId}`, () => listComments(videoId))
  // The server is the judge: if it says muted, the box goes even if this page was loaded before the mute.
  const [mutedNow, setMutedNow] = useState(false)
  const muted = !user.can_comment || mutedNow

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title" className="comments-title">
        Comments{comments.kind === 'ready' && comments.value.length > 0 ? ` ${comments.value.length}` : ''}
      </h2>

      {!published ? (
        <p className="muted">Comments open once the video is published.</p>
      ) : muted ? (
        <p className="comments-muted">You can't post comments at the moment. You can still watch and read them.</p>
      ) : (
        <CommentBox videoId={videoId} onPosted={reload} onMuted={() => setMutedNow(true)} />
      )}

      {comments.kind === 'loading' && <Loading what="comments" />}
      {comments.kind === 'failed' && <LoadFailed message={comments.message} onRetry={reload} />}
      {comments.kind === 'ready' && comments.value.length === 0 && published && (
        <p className="muted">No comments yet.{muted ? '' : ' Be the first!'}</p>
      )}
      {comments.kind === 'ready' && comments.value.length > 0 && (
        <ul className="comment-list">
          {comments.value.map((comment) => (
            <CommentItem key={comment.id} comment={comment} canDelete={user.role === 'admin'} onDeleted={reload} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CommentBox({ videoId, onPosted, onMuted }: { videoId: number; onPosted: () => void; onMuted: () => void }) {
  const id = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const length = Array.from(text.trim()).length
  const tooLong = length > COMMENT_MAX

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || tooLong) return
    setPosting(true)
    const result = await postComment(videoId, text)
    setPosting(false)
    if (result.ok) {
      setText('')
      setError(null)
      onPosted()
    } else if (result.status === 403) {
      onMuted()
    } else {
      setError(result.message)
    }
  }

  return (
    <form className="comment-box" onSubmit={submit} noValidate>
      <label className="visually-hidden" htmlFor={`${id}-text`}>
        Add a comment
      </label>
      <textarea
        id={`${id}-text`}
        className="input comment-input"
        rows={2}
        placeholder="Add a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={length >= COUNTER_FROM ? `${id}-count` : undefined}
        aria-invalid={tooLong || undefined}
      />
      <div className="comment-box-row">
        {length >= COUNTER_FROM ? (
          <span id={`${id}-count`} className={tooLong ? 'comment-count comment-count-over' : 'comment-count'} aria-live="polite">
            {length} / {COMMENT_MAX}
          </span>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-small" disabled={posting || !text.trim() || tooLong}>
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

// The admin also gets Delete, which asks first (inline, as in the admin panel).
function CommentItem({ comment, canDelete, onDeleted }: { comment: Comment; canDelete: boolean; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    const result = await deleteComment(comment.id)
    setBusy(false)
    if (result.ok) onDeleted()
    else setError(result.message)
  }

  return (
    <li className="comment">
      <span className="comment-avatar" aria-hidden="true">
        {comment.user.username.charAt(0).toUpperCase()}
      </span>
      <div className="comment-main">
        <p className="comment-meta">
          <span className="comment-name">{comment.user.username}</span>{' '}
          <time className="muted-inline" dateTime={comment.created_at}>
            · {commentAge(comment.created_at)}
          </time>
        </p>
        <p className="comment-body">{comment.body}</p>
        {canDelete &&
          (confirming ? (
            <div className="comment-actions">
              <span className="comment-confirm">Delete this comment?</span>
              <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void remove()}>
                Yes, delete
              </button>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="comment-actions">
              <button type="button" className="btn-link comment-delete" onClick={() => setConfirming(true)}>
                Delete
              </button>
            </div>
          ))}
        {error && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}
