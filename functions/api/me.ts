import type { ApiFunction } from '../lib/env'

// Deliberately unguarded: pending and unregistered users need this to know which screen to show.
export const onRequestGet: ApiFunction = ({ data }) =>
  Response.json({
    email: data.email,
    user: data.user,
    status: data.user?.status ?? 'unregistered',
  })
