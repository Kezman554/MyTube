import { verifyAccessJwt, devEmail } from '../lib/access'
import { createUser, getUserByEmail } from '../lib/db'
import type { ApiFunction } from '../lib/env'

// Every /api request: establish who is calling from the Access JWT, then load their user row.
// Approval and role checks are left to the guards in functions/lib/guards.ts.
export const onRequest: ApiFunction = async (context) => {
  const { request, env } = context

  let email = devEmail(request, env)
  if (!email) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion')
    if (!token) return Response.json({ error: 'unauthenticated' }, { status: 401 })
    email = await verifyAccessJwt(token, env)
    if (!email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let user = await getUserByEmail(env.DB, email)
  if (!user && env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.toLowerCase()) {
    user = await createUser(env.DB, email, email.split('@')[0], 'admin', 'approved')
  }

  context.data.email = email
  context.data.user = user
  return context.next()
}
