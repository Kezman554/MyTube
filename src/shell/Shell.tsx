import { Link, Outlet, useMatch } from 'react-router'
import { useMe } from '../auth/MeContext'
import { AccountMenu } from './AccountMenu'
import { LogoMark } from './Pixels'
import './shell.css'

// Every page inside the app: the top bar (wordmark home, account button) over the page.
// No sidebar: Upload and Admin are in the account menu, Videos and Playlists are channel tabs.
export function Shell() {
  const { user } = useMe()
  const onAdmin = useMatch('/admin/*')
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-brand">
          <Link to="/" className="topbar-home" aria-label="MyTube, channel home">
            <LogoMark size={28} />
            <span className="topbar-wordmark">MyTube</span>
          </Link>
          {onAdmin && <span className="topbar-chip">Admin</span>}
        </div>
        <AccountMenu user={user} />
      </header>
      <main id="main" className="shell-main">
        <Outlet />
      </main>
    </>
  )
}
