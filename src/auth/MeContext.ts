import { createContext, useContext } from 'react'
import type { Me, User } from './api'
import type { Power } from './powers'

// The approved caller, provided by AuthGate to everything inside the main app.
export const MeContext = createContext<Me | null>(null)

export type ApprovedMe = Me & { user: User }

export function useMe(): ApprovedMe {
  const me = useContext(MeContext)
  if (!me?.user) throw new Error('useMe() must be used inside AuthGate')
  return me as ApprovedMe
}

// Whether the caller holds a power (the admin holds them all). The API enforces the same rules.
export function can(me: Me, power: Power) {
  return me.powers.includes(power)
}

export function isAdmin(me: ApprovedMe) {
  return me.user.role === 'admin'
}
