import { createUser, first } from '../lib/db'
import type { ApiFunction } from '../lib/env'
import { checkUsername } from '../lib/username'

// Unguarded by design: the caller has a verified Access email but no user row yet.
// Creates them as a pending viewer; the admin approves them later.
export const onRequestPost: ApiFunction = async ({ request, env, data }) => {
  if (data.user) return Response.json({ error: 'already_registered' }, { status: 409 })

  let body: { username?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const check = checkUsername(body?.username)
  if (!check.ok) return Response.json({ error: 'invalid_username', message: check.message }, { status: 400 })

  const taken = await first(env.DB, 'SELECT 1 FROM users WHERE username = ?', check.username)
  if (taken) return usernameTaken()

  let user
  try {
    user = await createUser(env.DB, data.email, check.username, 'viewer', 'pending')
  } catch (err) {
    // Lost a race: someone took the username, or this email registered, between the check and the insert.
    if (String(err).includes('UNIQUE')) {
      return String(err).includes('users.email')
        ? Response.json({ error: 'already_registered' }, { status: 409 })
        : usernameTaken()
    }
    throw err
  }

  return Response.json({ email: data.email, user, status: user!.status }, { status: 201 })
}

function usernameTaken() {
  return Response.json(
    { error: 'username_taken', message: 'That username is taken. Try another.' },
    { status: 409 },
  )
}
