import { createContext, useContext } from 'react'
import type { Me, User } from './api'

// The approved caller, provided by AuthGate to everything inside the main app.
export const MeContext = createContext<Me | null>(null)

export function useMe(): Me & { user: User } {
  const me = useContext(MeContext)
  if (!me?.user) throw new Error('useMe() must be used inside AuthGate')
  return me as Me & { user: User }
}

export function canUpload(user: User) {
  return user.role === 'creator' || user.role === 'admin'
}
