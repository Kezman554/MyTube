import { useState } from 'react'
import { useMe } from '../auth/MeContext'
import { useLoad } from '../lib/useLoad'
import { LoadFailed, Loading } from '../pages/Status'
import { listUsers, updateUser, type AdminUser, type UserChanges } from './api'
import './admin.css'

// Admin only: approve or reject people who have registered, then manage everyone approved.
// Removed users are not listed. Rejecting and removing both set status = 'removed' and ask first.
export function Users() {
  const [users, reload] = useLoad('users', listUsers)

  if (users.kind === 'loading') return <Loading what="users" />
  if (users.kind === 'failed') return <LoadFailed message={users.message} onRetry={reload} />

  const pending = users.value.filter((u) => u.status === 'pending')
  const approved = users.value.filter((u) => u.status === 'approved')

  return (
    <>
      <section className="panel panel-attention" aria-labelledby="pending-title">
        <h2 id="pending-title" className="panel-title">
          Waiting for approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="muted">Nobody is waiting.</p>
        ) : (
          <ul className="admin-list">
            {pending.map((user) => (
              <PendingRow key={user.id} user={user} onChanged={reload} />
            ))}
          </ul>
        )}
      </section>
      <section className="panel" aria-labelledby="approved-title">
        <h2 id="approved-title" className="panel-title">
          Approved users ({approved.length})
        </h2>
        <ul className="admin-list">
          {approved.map((user) => (
            <ApprovedRow key={user.id} user={user} onChanged={reload} />
          ))}
        </ul>
      </section>
    </>
  )
}

// One PATCH at a time per row. The list is reloaded after each change, so it shows the server's view.
function useChange(id: number, onChanged: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function change(changes: UserChanges) {
    setBusy(true)
    setError(null)
    const result = await updateUser(id, changes)
    setBusy(false)
    if (result.ok) onChanged()
    else setError(result.message)
  }
  return { busy, error, change }
}

function Who({ user }: { user: AdminUser }) {
  return (
    <>
      <h3 className="admin-item-name">{user.username}</h3>
      <p className="muted">
        {user.email} · registered {new Date(user.created_at).toLocaleDateString()}
      </p>
    </>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="alert-error" role="alert">
      {error}
    </p>
  )
}

function PendingRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, error, change } = useChange(user.id, onChanged)

  return (
    <li className="admin-item">
      <Who user={user} />
      <ErrorLine error={error} />
      {confirming ? (
        <div className="admin-actions">
          <p className="admin-confirm">Reject {user.username}? They will see that their access was removed.</p>
          <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void change({ status: 'removed' })}>
            Yes, reject
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(false)}>
            Keep waiting
          </button>
        </div>
      ) : (
        <div className="admin-actions">
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void change({ status: 'approved' })}>
            Approve
          </button>
          <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => setConfirming(true)}>
            Reject
          </button>
        </div>
      )}
    </li>
  )
}

function ApprovedRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const me = useMe().user
  const [confirm, setConfirm] = useState<'none' | 'mute' | 'remove'>('none')
  const { busy, error, change } = useChange(user.id, onChanged)
  const muted = user.can_comment === 0

  async function confirmed() {
    await change(confirm === 'mute' ? { can_comment: false } : { status: 'removed' })
    setConfirm('none')
  }

  return (
    <li className="admin-item">
      <Who user={user} />
      <ErrorLine error={error} />
      {user.role === 'admin' ? (
        // The server never changes an admin's role or status here, so there are no controls.
        <p className="muted">Admin{user.id === me.id ? ' (you)' : ''}</p>
      ) : confirm === 'none' ? (
        <div className="admin-actions">
          <label className="admin-role">
            <span className="field-label">Role</span>
            <select
              className="input"
              value={user.role}
              disabled={busy}
              onChange={(e) => void change({ role: e.target.value as 'creator' | 'viewer' })}
            >
              <option value="viewer">Viewer</option>
              <option value="creator">Creator</option>
            </select>
          </label>
          {muted ? (
            <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => void change({ can_comment: true })}>
              Unmute
            </button>
          ) : (
            <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => setConfirm('mute')}>
              Mute
            </button>
          )}
          <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => setConfirm('remove')}>
            Remove
          </button>
          {muted && <span className="chip">Muted</span>}
        </div>
      ) : (
        <div className="admin-actions">
          <p className="admin-confirm">
            {confirm === 'mute'
              ? `Mute ${user.username}? They can still watch and read comments, but can't post any.`
              : `Remove ${user.username}? They lose all access straight away. Their comments and likes stay.`}
          </p>
          <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void confirmed()}>
            {confirm === 'mute' ? 'Yes, mute' : 'Yes, remove'}
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirm('none')}>
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}
