import { useId, useState } from 'react'
import { can, isAdmin, useMe } from '../auth/MeContext'
import { POWER_LABELS, POWERS, type Power } from '../auth/powers'
import { useLoad } from '../lib/useLoad'
import { LoadFailed, Loading } from '../pages/Status'
import { listUsers, setPowers, updateUser, type AdminUser, type UserChanges } from './api'
import './admin.css'

// approve_users: approve or reject people who have registered, then manage everyone approved.
// Removed users are not listed. Rejecting and removing both set status = 'removed' and ask first.
// Mute needs moderate_comments too; only the admin sees and changes each person's powers.
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
  const me = useMe()
  const [confirm, setConfirm] = useState<'none' | 'mute' | 'remove'>('none')
  const { busy, error, change } = useChange(user.id, onChanged)
  const muted = user.can_comment === 0
  const self = user.id === me.user.id
  const canMute = can(me, 'moderate_comments')

  async function confirmed() {
    await change(confirm === 'mute' ? { can_comment: false } : { status: 'removed' })
    setConfirm('none')
  }

  // Nothing done under a power acts on the admin, and nobody removes themselves: no controls there.
  if (user.role === 'admin' || self) {
    return (
      <li className="admin-item">
        <Who user={user} />
        <p className="muted">
          {user.role === 'admin' ? 'Admin' : <PowerSummary powers={user.powers} />}
          {self ? ' (you)' : ''}
        </p>
      </li>
    )
  }

  return (
    <li className="admin-item">
      <Who user={user} />
      {isAdmin(me) ? (
        <PowersEditor user={user} onSaved={onChanged} />
      ) : (
        <p className="muted">
          <PowerSummary powers={user.powers} />
        </p>
      )}
      <ErrorLine error={error} />
      {confirm === 'none' ? (
        <div className="admin-actions">
          {canMute &&
            (muted ? (
              <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => void change({ can_comment: true })}>
                Unmute
              </button>
            ) : (
              <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => setConfirm('mute')}>
                Mute
              </button>
            ))}
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

function PowerSummary({ powers }: { powers: Power[] }) {
  return <>{powers.length === 0 ? 'Watches and comments' : powers.map((p) => POWER_LABELS[p].name).join(', ')}</>
}

// The admin only: tick the powers this person should have, then Save. The server takes the full list,
// and the change applies from their next request.
function PowersEditor({ user, onSaved }: { user: AdminUser; onSaved: () => void }) {
  const id = useId()
  const [chosen, setChosen] = useState<Set<Power>>(() => new Set(user.powers))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = chosen.size !== user.powers.length || user.powers.some((p) => !chosen.has(p))

  function toggle(power: Power, on: boolean) {
    const next = new Set(chosen)
    if (on) next.add(power)
    else next.delete(power)
    setChosen(next)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const result = await setPowers(user.id, POWERS.filter((p) => chosen.has(p)))
    setBusy(false)
    if (result.ok) onSaved()
    else setError(result.message)
  }

  return (
    <fieldset className="powers" aria-describedby={`${id}-hint`}>
      <legend className="field-label">Powers</legend>
      <p id={`${id}-hint`} className="muted powers-hint">
        Everyone approved can watch, like and comment. Powers add to that.
      </p>
      <ul className="powers-list">
        {POWERS.map((power) => (
          <li key={power}>
            <label className="powers-check">
              <input type="checkbox" checked={chosen.has(power)} disabled={busy} onChange={(e) => toggle(power, e.target.checked)} />
              <span>
                <span className="powers-name">{POWER_LABELS[power].name}</span>
                <span className="muted powers-detail">{POWER_LABELS[power].detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="admin-actions">
        <button type="button" className="btn btn-small" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : `Save ${user.username}'s powers`}
        </button>
        {dirty && !busy && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setChosen(new Set(user.powers))}>
            Undo changes
          </button>
        )}
      </div>
      <ErrorLine error={error} />
    </fieldset>
  )
}
