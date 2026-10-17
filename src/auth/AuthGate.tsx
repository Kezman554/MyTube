import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, type Me } from './api'
import { GateMessage, RegisterPage, RemovedPage, WaitingPage } from './GatePages'
import './gate.css'

type GateState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; me: Me }

const check = (): Promise<GateState> =>
  fetchMe().then(
    (me) => ({ kind: 'ready', me }),
    () => ({ kind: 'error' }),
  )

// The one place that decides what a visitor sees: asks /api/me on load and routes by status.
// The API enforces approval on its own; this only picks the right screen.
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'loading' })

  const load = useCallback(() => check().then(setState), [])

  useEffect(() => {
    let live = true
    check().then((next) => live && setState(next))
    return () => {
      live = false
    }
  }, [])

  if (state.kind === 'loading') return <GateMessage title="Loading" busy />
  if (state.kind === 'error') {
    return (
      <GateMessage title="Can't reach MyTube" action={{ label: 'Try again', onClick: load }}>
        Check your connection and try again.
      </GateMessage>
    )
  }

  const { me } = state
  switch (me.status) {
    case 'unregistered':
      return <RegisterPage email={me.email} onRegistered={(next) => setState({ kind: 'ready', me: next })} />
    case 'pending':
      return <WaitingPage username={me.user?.username ?? ''} onCheckAgain={load} />
    case 'removed':
      return <RemovedPage />
    case 'approved':
      return <>{children}</>
  }
}
