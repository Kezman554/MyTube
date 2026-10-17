import { verifyAccessJwt, devEmail } from '../lib/access'
import { createUser, getUserByEmail } from '../lib/db'
import type { ApiFunction } from '../lib/env'
import { requireApproved } from '../lib/guards'

// Every /api request: establish who is calling from the Access JWT, then load their user row.
export const identify: ApiFunction = async (context) => {
  const { request, env } = context

  let email = devEmail(request, env)
  if (!email) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion')
    if (!token) return Response.json({ error: 'unauthenticated' }, { status: 401 })
    email = await verifyAccessJwt(token, env)
    if (!email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let user = await getUserByEmail(env.DB, email)
  // The token's email is already lowercased; ADMIN_EMAIL is normalised the same way, so a capitalised
  // value or a stray space or line break pasted into the dashboard still matches.
  if (!user && env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.trim().toLowerCase()) {
    user = await createUser(env.DB, email, email.split('@')[0], 'admin', 'approved')
  }

  context.data.email = email
  context.data.user = user
  return context.next()
}

// Routes that unregistered, pending and removed users must still reach. Keep this list short:
// it is the only way past approval, and none of these return channel content.
export const OPEN_ROUTES = new Set(['/api/health', '/api/me', '/api/register'])

// Approval is the default: every other /api route answers 403 unless the caller is approved,
// so a new content route is guarded even if it forgets requireApproved. Role checks stay on the routes.
export const gate: ApiFunction = (context) => {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, '')
  if (OPEN_ROUTES.has(path)) return context.next()
  return requireApproved(context)
}

export const onRequest = [identify, gate]
