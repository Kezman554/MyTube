import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router'
import { deleteComment, updateUser } from '../admin/api'
import { useMe } from '../auth/MeContext'
import { commentAge } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { COMMENT_MAX, listComments, postComment, type Comment, type Reply, type Thread } from '../videos/api'
import { LoadFailed, Loading } from './Status'
import './comments.css'

// The counter appears once a comment gets this close to the limit.
const COUNTER_FROM = COMMENT_MAX - 200

// A thread with more replies than this shows them behind "N replies".
const REPLIES_SHOWN = 3

// Which comment the open reply box answers. It always opens under the top-level comment (threadId),
// whether Reply was pressed on that comment or on one of its replies (commentId).
interface ReplyTarget {
  threadId: number
  commentId: number
  username: string
}

// Comments under a video: the box to add one (or a short message for muted users), then the
// comments newest first with who wrote them and when, each with its replies oldest first.
export function Comments({ videoId, published }: { videoId: number; published: boolean }) {
  const { user } = useMe()
  const [comments, reload] = useLoad(`comments:${videoId}`, () => listComments(videoId))
  // The server is the judge: if it says muted, the boxes go even if this page was loaded before the mute.
  const [mutedNow, setMutedNow] = useState(false)
  const muted = !user.can_comment || mutedNow
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const canReply = published && !muted

  // /watch/:id#comment-N (from the admin's Comments tab) scrolls to that comment once it has loaded.
  const { hash } = useLocation()
  const linked = /^#comment-(\d+)$/.exec(hash)?.[1]
  const linkedId = linked ? Number(linked) : null
  const ready = comments.kind === 'ready'
  useEffect(() => {
    if (ready && linkedId !== null) document.getElementById(`comment-${linkedId}`)?.scrollIntoView({ block: 'center' })
  }, [ready, linkedId])

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title" className="comments-title">
        Comments{comments.kind === 'ready' && comments.value.count > 0 ? ` ${comments.value.count}` : ''}
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
      {comments.kind === 'ready' && comments.value.comments.length === 0 && published && (
        <p className="muted">No comments yet.{muted ? '' : ' Be the first!'}</p>
      )}
      {comments.kind === 'ready' && comments.value.comments.length > 0 && (
        <ul className="comment-list">
          {comments.value.comments.map((thread) => (
            <ThreadItem
              key={thread.id}
              videoId={videoId}
              thread={thread}
              canReply={canReply}
              linkedId={linkedId}
              replyTarget={replyTarget?.threadId === thread.id ? replyTarget : null}
              onReply={setReplyTarget}
              onChanged={reload}
              onMuted={() => setMutedNow(true)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ThreadItem({
  videoId,
  thread,
  canReply,
  linkedId,
  replyTarget,
  onReply,
  onChanged,
  onMuted,
}: {
  videoId: number
  thread: Thread
  canReply: boolean
  linkedId: number | null
  replyTarget: ReplyTarget | null
  onReply: (target: ReplyTarget | null) => void
  onChanged: () => void
  onMuted: () => void
}) {
  const { replies } = thread
  const collapsible = replies.length > REPLIES_SHOWN
  // A thread opens by itself when a link points at one of its replies.
  const [expanded, setExpanded] = useState(() => replies.some((r) => r.id === linkedId))
  const showReplies = !collapsible || expanded
  const repliesId = useId()

  const reply = (comment: Comment) => onReply({ threadId: thread.id, commentId: comment.id, username: comment.user.username })

  return (
    <li className="comment-thread">
      <CommentItem
        comment={thread}
        replyCount={replies.length}
        canReply={canReply}
        linked={thread.id === linkedId}
        onReply={() => reply(thread)}
        onDeleted={onChanged}
      />
      {(replies.length > 0 || replyTarget) && (
        <div className="comment-replies">
          {collapsible && (
            <button
              type="button"
              className="btn-link comment-toggle"
              aria-expanded={expanded}
              aria-controls={repliesId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide replies' : `${replies.length} replies`}
            </button>
          )}
          {showReplies && replies.length > 0 && (
            <ul className="comment-list comment-reply-list" id={repliesId} aria-label={`Replies to ${thread.user.username}`}>
              {replies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  canReply={canReply}
                  linked={r.id === linkedId}
                  onReply={() => reply(r)}
                  onDeleted={onChanged}
                />
              ))}
            </ul>
          )}
          {replyTarget && canReply && (
            <CommentBox
              videoId={videoId}
              replyTo={replyTarget}
              onPosted={() => {
                onReply(null)
                // Show the new reply even in a collapsed thread.
                setExpanded(true)
                onChanged()
              }}
              onCancel={() => onReply(null)}
              onMuted={onMuted}
              onGone={onChanged}
            />
          )}
        </div>
      )}
    </li>
  )
}

function CommentBox({
  videoId,
  replyTo,
  onPosted,
  onCancel,
  onMuted,
  onGone,
}: {
  videoId: number
  replyTo?: ReplyTarget
  onPosted: () => void
  onCancel?: () => void
  onMuted: () => void
  // The comment being replied to was deleted meanwhile: the list is reloaded so it disappears.
  onGone?: () => void
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const length = Array.from(text.trim()).length
  const tooLong = length > COMMENT_MAX
  const input = useRef<HTMLTextAreaElement>(null)
  const label = replyTo ? `Reply to ${replyTo.username}` : 'Add a comment'

  // A reply box takes the focus when it opens, or moves to another comment in the same thread.
  const replyToId = replyTo?.commentId
  useEffect(() => {
    if (replyToId !== undefined) input.current?.focus()
  }, [replyToId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || tooLong) {
      setError(tooLong ? `Comments can be up to ${COMMENT_MAX} characters.` : 'Write a comment first.')
      input.current?.focus()
      return
    }
    setPosting(true)
    const result = await postComment(videoId, text, replyTo?.commentId)
    setPosting(false)
    if (result.ok) {
      setText('')
      setError(null)
      onPosted()
    } else if (result.status === 403) {
      onMuted()
    } else {
      setError(result.message)
      if (result.status === 400 && replyTo) onGone?.()
    }
  }

  return (
    <form className={replyTo ? 'comment-box comment-reply-box' : 'comment-box'} onSubmit={submit} noValidate>
      <label className="visually-hidden" htmlFor={`${id}-text`}>
        {label}
      </label>
      <textarea
        ref={input}
        id={`${id}-text`}
        className="input comment-input"
        rows={2}
        placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Add a comment…'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
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
        <div className="comment-box-buttons">
          {onCancel && (
            <button type="button" className="btn btn-quiet btn-small" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn-small" disabled={posting}>
            {posting ? 'Posting…' : replyTo ? 'Reply' : 'Post'}
          </button>
        </div>
      </div>
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

// One comment or reply. Reply opens the box under its thread. With moderate_comments the server marks
// which of Delete and Mute will work (never on the admin's comments, or Delete on a thread holding the
// admin's reply), and only those show. Delete asks first and says how many replies go with it; Mute is
// one click, since Unmute sits in the same place.
function CommentItem({
  comment,
  replyCount = 0,
  canReply,
  linked,
  onReply,
  onDeleted,
}: {
  comment: Comment | Reply
  replyCount?: number
  canReply: boolean
  linked: boolean
  onReply: () => void
  onDeleted: () => void
}) {
  const canDelete = comment.moderation?.delete === true
  const canMute = comment.moderation?.mute === true
  const muted = comment.moderation?.muted === true
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isReply = 'parent_id' in comment
  const replyTo = isReply ? comment.reply_to : null

  async function act(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    // Muting changes every comment by the same person, so the whole list is reloaded either way.
    if (result.ok) onDeleted()
    else setError(result.message ?? null)
  }

  const question = isReply
    ? 'Delete this reply?'
    : replyCount === 0
      ? 'Delete this comment?'
      : `Delete this comment and its ${replyCount === 1 ? 'reply' : `${replyCount} replies`}?`

  const Tag = isReply ? 'li' : 'div'
  return (
    <Tag id={`comment-${comment.id}`} className={`comment${isReply ? ' comment-reply' : ''}${linked ? ' comment-linked' : ''}`}>
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
        <p className="comment-body">
          {replyTo && <span className="comment-mention">@{replyTo.username} </span>}
          {comment.body}
        </p>
        {confirming ? (
          <div className="comment-actions">
            <span className="comment-confirm">{question}</span>
            <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void act(() => deleteComment(comment.id))}>
              Yes, delete
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          (canReply || canDelete || canMute) && (
            <div className="comment-actions">
              {canReply && (
                <button type="button" className="btn-link comment-action" onClick={onReply} aria-label={`Reply to ${comment.user.username}`}>
                  Reply
                </button>
              )}
              {canDelete && (
                <button type="button" className="btn-link comment-action comment-delete" onClick={() => setConfirming(true)}>
                  Delete
                </button>
              )}
              {canMute && (
                <button
                  type="button"
                  className="btn-link comment-action"
                  disabled={busy}
                  onClick={() => void act(() => updateUser(comment.user.id, { can_comment: muted }))}
                >
                  {muted ? `Unmute ${comment.user.username}` : `Mute ${comment.user.username}`}
                </button>
              )}
            </div>
          )
        )}
        {error && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Tag>
  )
}
