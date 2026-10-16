import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from './env'

// One key set per team domain, kept for the life of the isolate so keys are fetched once and cached.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function keySetFor(teamDomain: string) {
  let keySet = keySets.get(teamDomain)
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    keySets.set(teamDomain, keySet)
  }
  return keySet
}

// Verifies a Cf-Access-Jwt-Assertion token and returns its email, or null if it is invalid.
export async function verifyAccessJwt(token: string, env: Env): Promise<string | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null
  try {
    const { payload } = await jwtVerify(token, keySetFor(env.ACCESS_TEAM_DOMAIN), {
      audience: env.ACCESS_AUD,
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      algorithms: ['RS256'],
    })
    return typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null
  } catch {
    return null
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// DEV_EMAIL only applies to requests addressed to this machine, which a deployed site never receives,
// so setting it in production by mistake has no effect.
export function devEmail(request: Request, env: Env): string | null {
  if (!env.DEV_EMAIL) return null
  return LOCAL_HOSTS.has(new URL(request.url).hostname) ? env.DEV_EMAIL.toLowerCase() : null
}
