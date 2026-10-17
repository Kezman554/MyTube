import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import type { User } from '../auth/api'
import { canUpload } from '../auth/MeContext'

const ROLE_NAMES = { admin: 'Admin', creator: 'Creator', viewer: 'Viewer' } as const

// The square account button in the top bar, and the menu it opens: who you are, then the pages
// your role can reach. Upload shows for creators and the admin, Admin for the admin only.
// A disclosure (button + list of links), not an ARIA menu, so Tab and Enter work as everywhere else.
export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  // Close on a click or tap anywhere outside the menu.
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      setOpen(false)
      button.current?.focus()
    }
  }

  const close = () => setOpen(false)
  const initial = user.username.charAt(0).toUpperCase()

  return (
    <div className="account" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="account-button"
        aria-label={`Your account, ${user.username}`}
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((o) => !o)}
      >
        {initial}
      </button>
      {open && (
        <div id={`${id}-menu`} className="account-menu">
          <p className="account-who">
            <span className="account-name">{user.username}</span>
            <span className="muted">{ROLE_NAMES[user.role]}</span>
          </p>
          <ul className="account-links">
            <li>
              <Link to="/" onClick={close}>
                Channel
              </Link>
            </li>
            <li>
              <Link to="/playlists" onClick={close}>
                Playlists
              </Link>
            </li>
            {canUpload(user) && (
              <li>
                <Link to="/upload" onClick={close}>
                  Upload
                </Link>
              </li>
            )}
            {user.role === 'admin' && (
              <li>
                <Link to="/admin" onClick={close}>
                  Admin
                </Link>
              </li>
            )}
            <li className="account-signout">
              {/* Cloudflare Access ends the session; the next visit asks for a new email code. */}
              <a href="/cdn-cgi/access/logout">Sign out</a>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
